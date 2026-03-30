import { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Button, Modal, Form, Input, message, Popconfirm, Tooltip, Tree } from 'antd';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined, UserOutlined,
  FolderOpenOutlined, LockOutlined, DeleteOutlined, PoweroffOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '@/services/api';
import type { ApiResponse } from '@/types';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import RequireSoftware from '@/components/RequireSoftware';

interface FTPAccount {
  id: number;
  username: string;
  path: string;
  status: number;
  created_by: number | null;
  created_at: string;
}

const generatePassword = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const relativeTime = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
};

// ---------------------------------------------------------------------------
// Path browser helpers
// ---------------------------------------------------------------------------
const loadPathChildren = async (parentPath: string) => {
  try {
    const { data } = await api.get('/files', { params: { path: parentPath } });
    const items = data.data?.items || data.data || [];
    const dirs = (items as any[]).filter((f: any) => f.is_dir);
    return dirs.map((d: any) => ({
      title: d.name,
      key: d.path || `${parentPath === '/' ? '' : parentPath}/${d.name}`,
      isLeaf: false,
    }));
  } catch {
    return [];
  }
};

function FTPContent() {
  const { t } = useTranslation();
  const { p, isDark } = usePalette();
  const isMobile = useIsMobile();

  // Data
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<FTPAccount[]>([]);
  const [searchText, setSearchText] = useState('');

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [editPathOpen, setEditPathOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<FTPAccount | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Forms
  const [createForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [editPathForm] = Form.useForm();

  // Path browser
  const [pathBrowserOpen, setPathBrowserOpen] = useState(false);
  const [pathBrowserTarget, setPathBrowserTarget] = useState<'create' | 'edit'>('create');
  const [pathTreeData, setPathTreeData] = useState<any[]>([]);
  const [pathBrowserSelected, setPathBrowserSelected] = useState('/');

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------
  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<FTPAccount[]>>('/ftp');
      setAccounts(data.data ?? []);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const filteredAccounts = useMemo(() => {
    if (!searchText) return accounts;
    const q = searchText.toLowerCase();
    return accounts.filter(a =>
      a.username.toLowerCase().includes(q) ||
      a.path.toLowerCase().includes(q)
    );
  }, [accounts, searchText]);

  // ---------------------------------------------------------------------------
  // CRUD handlers
  // ---------------------------------------------------------------------------
  const handleCreate = async (values: Record<string, string>) => {
    setSubmitting(true);
    try {
      await api.post('/ftp', values);
      message.success(t('common.success'));
      setCreateOpen(false);
      createForm.resetFields();
      fetchAccounts();
    } catch {
      message.error(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangePassword = async (values: Record<string, string>) => {
    if (!selectedAccount) return;
    setSubmitting(true);
    try {
      await api.put(`/ftp/${selectedAccount.id}/password`, values);
      message.success(t('common.success'));
      setPasswordOpen(false);
      passwordForm.resetFields();
    } catch {
      message.error(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditPath = async (values: { path: string }) => {
    if (!selectedAccount) return;
    setSubmitting(true);
    try {
      await api.put(`/ftp/${selectedAccount.id}`, { path: values.path });
      message.success(t('common.success'));
      setEditPathOpen(false);
      editPathForm.resetFields();
      fetchAccounts();
    } catch {
      message.error(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (record: FTPAccount) => {
    try {
      await api.put(`/ftp/${record.id}/status`, { enabled: record.status !== 1 });
      message.success(t('common.success'));
      fetchAccounts();
    } catch {
      message.error(t('common.error'));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/ftp/${id}`);
      message.success(t('common.success'));
      fetchAccounts();
    } catch {
      message.error(t('common.error'));
    }
  };

  // ---------------------------------------------------------------------------
  // Path browser
  // ---------------------------------------------------------------------------
  const onPathTreeLoad = (node: any): Promise<void> =>
    new Promise(async (resolve) => {
      if (node.children) { resolve(); return; }
      const children = await loadPathChildren(node.key);
      setPathTreeData(prev => {
        const update = (nodes: any[]): any[] =>
          nodes.map(n =>
            n.key === node.key
              ? {
                  ...n,
                  children: children.length
                    ? children
                    : [{ title: '(empty)', key: `${node.key}/__empty`, isLeaf: true, disabled: true, selectable: false }],
                }
              : { ...n, children: n.children ? update(n.children) : undefined }
          );
        return update(prev);
      });
      resolve();
    });

  const openPathBrowser = async (target: 'create' | 'edit') => {
    setPathBrowserTarget(target);
    const roots = await loadPathChildren('/');
    setPathTreeData(roots);
    const currentPath = target === 'create'
      ? createForm.getFieldValue('path') || '/'
      : editPathForm.getFieldValue('path') || selectedAccount?.path || '/';
    setPathBrowserSelected(currentPath);
    setPathBrowserOpen(true);
  };

  const confirmPathBrowser = () => {
    if (pathBrowserTarget === 'create') {
      createForm.setFieldsValue({ path: pathBrowserSelected });
    } else {
      editPathForm.setFieldsValue({ path: pathBrowserSelected });
    }
    setPathBrowserOpen(false);
  };

  // ---------------------------------------------------------------------------
  // Table columns
  // ---------------------------------------------------------------------------
  const columns = [
    {
      title: t('auth.username'),
      dataIndex: 'username',
      key: 'username',
      sorter: (a: FTPAccount, b: FTPAccount) => a.username.localeCompare(b.username),
      render: (v: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <UserOutlined style={{ color: p.accent, fontSize: 13 }} />
          <span style={{ fontWeight: 600, fontFamily: 'SFMono-Regular, Menlo, Consolas, monospace', fontSize: 13, color: p.text }}>{v}</span>
        </div>
      ),
    },
    {
      title: 'Home Directory',
      dataIndex: 'path',
      key: 'path',
      ellipsis: true,
      render: (v: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FolderOpenOutlined style={{ color: p.amber, fontSize: 12, flexShrink: 0 }} />
          <a
            href={`/files?path=${encodeURIComponent(v)}`}
            style={{
              fontSize: 12, fontFamily: 'SFMono-Regular, Menlo, Consolas, monospace',
              color: p.accent, background: p.codeBg,
              padding: '1px 6px', borderRadius: 4,
              textDecoration: 'none', wordBreak: 'break-all',
            }}
          >
            {v}
          </a>
        </div>
      ),
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: number) => {
        const color = status === 1 ? p.green : p.red;
        const label = status === 1 ? t('common.enabled') : t('common.disabled');
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '2px 10px', borderRadius: 99,
            background: `${color}15`, color, fontSize: 11, fontWeight: 500,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
            {label}
          </span>
        );
      },
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 120,
      render: (val: string) => val
        ? (
          <Tooltip title={new Date(val).toLocaleString()}>
            <span style={{ fontSize: 12, color: p.textMuted }}>{relativeTime(val)}</span>
          </Tooltip>
        )
        : <span style={{ color: p.textDim }}>—</span>,
    },
    {
      title: '',
      key: 'actions',
      width: 160,
      align: 'right' as const,
      render: (_: unknown, record: FTPAccount) => (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          <Tooltip title="Edit Path">
            <Button type="text" size="small"
              icon={<FolderOpenOutlined style={{ color: p.accent }} />}
              onClick={() => {
                setSelectedAccount(record);
                editPathForm.setFieldsValue({ path: record.path });
                setEditPathOpen(true);
              }}
            />
          </Tooltip>
          <Tooltip title="Change Password">
            <Button type="text" size="small"
              icon={<LockOutlined style={{ color: p.amber }} />}
              onClick={() => { setSelectedAccount(record); setPasswordOpen(true); }}
            />
          </Tooltip>
          <Tooltip title={record.status === 1 ? t('common.disable') : t('common.enable')}>
            <Button type="text" size="small"
              icon={<PoweroffOutlined style={{ color: record.status === 1 ? p.green : p.red }} />}
              onClick={() => handleToggleStatus(record)}
            />
          </Tooltip>
          <Popconfirm
            title={t('common.confirm_delete')}
            onConfirm={() => handleDelete(record.id)}
            okText={t('common.yes')}
            cancelText={t('common.no')}
            okButtonProps={{ danger: true }}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      ),
    },
  ];

  const mobileColumns = columns.filter(c => !['created_at'].includes(c.key));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div style={{
      background: p.card, borderRadius: 12,
      border: `1px solid ${p.cardBorder}`,
      boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px',
        background: p.headerBg,
        borderBottom: `1px solid ${p.cardBorder}`,
        borderRadius: '8px 8px 0 0',
        flexWrap: 'wrap', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: p.text }}>FTP Accounts</span>
          <span style={{
            background: `${p.accent}22`, color: p.accent,
            fontSize: 12, fontWeight: 600, padding: '2px 10px',
            borderRadius: 10,
          }}>{filteredAccounts.length}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            placeholder="Search..."
            prefix={<SearchOutlined style={{ color: p.textDim }} />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            allowClear
            size="middle"
            style={{ width: isMobile ? 140 : 200, background: p.inputBg }}
          />
          <Tooltip title={t('common.refresh')}>
            <Button icon={<ReloadOutlined />} onClick={fetchAccounts} />
          </Tooltip>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
            style={{ background: p.accent, borderColor: p.accent }}
          >
            {isMobile ? '' : 'Add Account'}
          </Button>
        </div>
      </div>

      {/* Table */}
      <Table
        columns={isMobile ? mobileColumns : columns}
        dataSource={filteredAccounts}
        rowKey="id"
        loading={loading}
        scroll={{ x: 650 }}
        size="middle"
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          size: 'small',
          showTotal: (total) => <span style={{ color: p.textMuted, fontSize: 13 }}>Total {total}</span>,
          style: { padding: '8px 16px', margin: 0 },
        }}
        style={{ background: p.card, fontSize: 13 }}
        rowClassName={() => 'ftp-table-row'}
      />

      {/* ============ Add FTP Account Modal ============ */}
      <Modal
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserOutlined style={{ color: p.accent }} />
            Add FTP Account
          </span>
        }
        open={createOpen}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        confirmLoading={submitting}
        okText={t('common.create')}
        cancelText={t('common.cancel')}
        destroyOnHidden
        width={isMobile ? '95%' : 520}
        okButtonProps={{ style: { background: p.accent, borderColor: p.accent } }}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate} size="small" style={{ marginTop: 12 }}>
          <Form.Item
            name="username"
            label={t('auth.username')}
            rules={[
              { required: true, message: 'Username is required' },
              { max: 32, message: 'Max 32 characters' },
              { pattern: /^[a-zA-Z0-9_]+$/, message: 'Only letters, numbers, underscores' },
            ]}
            style={{ marginBottom: 12 }}
          >
            <Input placeholder="ftpuser" prefix={<UserOutlined style={{ color: p.textDim }} />} />
          </Form.Item>
          <Form.Item
            name="password"
            label={
              <span>
                {t('auth.password')}
                <a
                  onClick={() => createForm.setFieldsValue({ password: generatePassword() })}
                  style={{ fontSize: 11, marginLeft: 8, color: p.accent }}
                >
                  Generate
                </a>
              </span>
            }
            rules={[{ required: true, message: 'Password is required' }, { min: 6, message: 'Min 6 characters' }]}
            style={{ marginBottom: 12 }}
          >
            <Input.Password placeholder="••••••••" />
          </Form.Item>
          <Form.Item
            name="path"
            label="Home Directory"
            rules={[{ required: true, message: 'Path is required' }]}
            extra={<span style={{ fontSize: 11, color: p.textMuted }}>Absolute path, e.g. /home/ftpuser or /var/www/html</span>}
          >
            <Input
              placeholder="/home/ftpuser"
              addonAfter={
                <FolderOpenOutlined
                  style={{ cursor: 'pointer', color: p.accent }}
                  onClick={() => openPathBrowser('create')}
                />
              }
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* ============ Change Password Modal ============ */}
      <Modal
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LockOutlined style={{ color: p.amber }} />
            Change Password — <code style={{ fontSize: 13, color: p.accent }}>{selectedAccount?.username ?? ''}</code>
          </span>
        }
        open={passwordOpen}
        onCancel={() => { setPasswordOpen(false); passwordForm.resetFields(); }}
        onOk={() => passwordForm.submit()}
        confirmLoading={submitting}
        okText="Update"
        cancelText={t('common.cancel')}
        destroyOnHidden
        width={isMobile ? '95%' : 440}
        okButtonProps={{ style: { background: p.accent, borderColor: p.accent } }}
      >
        <Form form={passwordForm} layout="vertical" onFinish={handleChangePassword} size="small" style={{ marginTop: 12 }}>
          <Form.Item
            name="password"
            label={
              <span>
                {t('auth.new_password')}
                <a
                  onClick={() => passwordForm.setFieldsValue({ password: generatePassword() })}
                  style={{ fontSize: 11, marginLeft: 8, color: p.accent }}
                >
                  Generate
                </a>
              </span>
            }
            rules={[{ required: true, message: 'Password is required' }, { min: 6, message: 'Min 6 characters' }]}
          >
            <Input.Password placeholder="••••••••" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ============ Edit Path Modal ============ */}
      <Modal
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FolderOpenOutlined style={{ color: p.accent }} />
            Edit Path — <code style={{ fontSize: 13, color: p.accent }}>{selectedAccount?.username ?? ''}</code>
          </span>
        }
        open={editPathOpen}
        onCancel={() => { setEditPathOpen(false); editPathForm.resetFields(); }}
        onOk={() => editPathForm.submit()}
        confirmLoading={submitting}
        okText="Update"
        cancelText={t('common.cancel')}
        destroyOnHidden
        width={isMobile ? '95%' : 480}
        okButtonProps={{ style: { background: p.accent, borderColor: p.accent } }}
      >
        <Form form={editPathForm} layout="vertical" onFinish={handleEditPath} size="small" style={{ marginTop: 12 }}>
          {selectedAccount && (
            <div style={{
              fontSize: 12, color: p.textMuted, marginBottom: 12,
              padding: '6px 10px', background: p.codeBg, borderRadius: 6,
            }}>
              Current: <code style={{ color: p.text }}>{selectedAccount.path}</code>
            </div>
          )}
          <Form.Item
            name="path"
            label="New Path"
            rules={[{ required: true, message: 'Path is required' }]}
          >
            <Input
              placeholder="/home/ftpuser"
              addonAfter={
                <FolderOpenOutlined
                  style={{ cursor: 'pointer', color: p.accent }}
                  onClick={() => openPathBrowser('edit')}
                />
              }
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* ============ Path Browser Modal ============ */}
      <Modal
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FolderOpenOutlined style={{ color: p.accent }} />
            Select Directory
          </span>
        }
        open={pathBrowserOpen}
        onOk={confirmPathBrowser}
        onCancel={() => setPathBrowserOpen(false)}
        width={isMobile ? '95%' : 460}
        okText="Select"
        cancelText={t('common.cancel')}
        okButtonProps={{ style: { background: p.accent, borderColor: p.accent } }}
      >
        <div style={{ padding: '8px 0', fontSize: 12, color: p.textMuted, marginBottom: 4 }}>
          Selected: <code style={{ color: p.accent }}>{pathBrowserSelected}</code>
        </div>
        <div style={{
          maxHeight: 340, overflow: 'auto',
          border: `1px solid ${p.cardBorder}`, borderRadius: 6,
          padding: 8, background: p.codeBg,
        }}>
          <Tree
            treeData={pathTreeData}
            loadData={onPathTreeLoad}
            onSelect={(keys) => { if (keys.length) setPathBrowserSelected(keys[0] as string); }}
            selectedKeys={[pathBrowserSelected]}
            showLine
            style={{ background: 'transparent' }}
          />
        </div>
      </Modal>

      {/* Row hover style */}
      <style>{`
        .ftp-table-row:hover td { background: ${p.rowHover} !important; }
      `}</style>
    </div>
  );
}

export default function FTP() {
  const { t } = useTranslation();
  return (
    <RequireSoftware softwareTypes={['ftp']} label={t('sidebar.ftp') || 'FTP Server (Pure-FTPd)'}>
      <FTPContent />
    </RequireSoftware>
  );
}
