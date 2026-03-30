import { useState, useEffect, useCallback, useRef } from 'react';
import { Modal, Button, Space, message, Typography, Spin, Input, Table, Popconfirm, Tree, Badge, Progress } from 'antd';
import {
  PlayCircleOutlined, PauseCircleOutlined, ReloadOutlined, SettingOutlined,
  FileTextOutlined, UserOutlined, TeamOutlined, PlusOutlined, DeleteOutlined,
  LockOutlined, CheckCircleFilled, CloudServerOutlined, InfoCircleOutlined,
  DownloadOutlined, FolderOutlined, MinusCircleOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import api from '@/services/api';
import { useIsMobile } from '@/hooks/useIsMobile';
import Editor from '@monaco-editor/react';

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Theme constants (matching global palette)
// ---------------------------------------------------------------------------
const PRIMARY = '#1565C0';
const PRIMARY_LIGHT = '#E3F2FD';
const BORDER = '#E8EDF2';
const TEXT_PRIMARY = '#1A1A2E';
const TEXT_SECONDARY = '#64748B';
const SUCCESS = '#4CAF50';
const WARNING = '#FF9800';
const ERROR = '#F44336';
const DARK_BG = '#1B2A4A';

// ---------------------------------------------------------------------------
// Sidebar sections
// ---------------------------------------------------------------------------
const SECTIONS = [
  { key: 'service',  label: 'Service',       icon: <PlayCircleOutlined /> },
  { key: 'accounts', label: 'Accounts',      icon: <UserOutlined /> },
  { key: 'bulk',     label: 'Bulk Create',   icon: <TeamOutlined /> },
  { key: 'config',   label: 'Configuration', icon: <SettingOutlined /> },
  { key: 'log',      label: 'Transfer Log',  icon: <FileTextOutlined /> },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

interface Props {
  open: boolean;
  onClose: () => void;
}

// ============================================================================
// Main Modal
// ============================================================================
export default function FTPManageModal({ open, onClose }: Props) {
  const isMobile = useIsMobile();
  const [section, setSection] = useState<SectionKey>('service');
  const [accountsRefresh, setAccountsRefresh] = useState(0);

  const triggerAccountsRefresh = useCallback(() => setAccountsRefresh(n => n + 1), []);

  const sidebarStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 16px',
    cursor: 'pointer',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: active ? PRIMARY : TEXT_PRIMARY,
    background: active ? PRIMARY_LIGHT : 'transparent',
    borderLeft: isMobile ? 'none' : (active ? `3px solid ${PRIMARY}` : '3px solid transparent'),
    borderBottom: isMobile ? (active ? `2px solid ${PRIMARY}` : '2px solid transparent') : 'none',
    fontWeight: active ? 600 : 400,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  });

  const renderContent = () => {
    switch (section) {
      case 'service':  return <ServiceTab />;
      case 'accounts': return <AccountsTab refreshKey={accountsRefresh} />;
      case 'bulk':     return <BulkCreateTab onCreated={triggerAccountsRefresh} />;
      case 'config':   return <ConfigTab />;
      case 'log':      return <TransferLogTab />;
      default:         return null;
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={
        <Space>
          <CloudServerOutlined style={{ color: '#6C757D' }} />
          <span>Pure-FTPd Management</span>
        </Space>
      }
      width={isMobile ? '95vw' : 960}
      styles={{ body: { padding: 0, maxHeight: '80vh', overflow: 'hidden' } }}
      destroyOnClose
    >
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: 520 }}>
        {/* Sidebar */}
        <div style={{
          width: isMobile ? '100%' : 180,
          borderRight: isMobile ? 'none' : `1px solid ${BORDER}`,
          borderBottom: isMobile ? `1px solid ${BORDER}` : 'none',
          display: 'flex',
          flexDirection: isMobile ? 'row' : 'column',
          overflowX: isMobile ? 'auto' : 'visible',
          flexShrink: 0,
          background: '#FAFBFC',
        }}>
          {SECTIONS.map(s => (
            <div
              key={s.key}
              style={sidebarStyle(section === s.key)}
              onClick={() => setSection(s.key)}
              onMouseEnter={e => { if (section !== s.key) e.currentTarget.style.background = '#f0f4f8'; }}
              onMouseLeave={e => { if (section !== s.key) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontSize: 15 }}>{s.icon}</span>
              {(!isMobile || section === s.key) && <span>{s.label}</span>}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: isMobile ? 16 : 24, overflow: 'auto', maxHeight: isMobile ? '60vh' : '78vh' }}>
          {renderContent()}
        </div>
      </div>
    </Modal>
  );
}

// ============================================================================
// Service Tab
// ============================================================================
function ServiceTab() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data: resp } = await api.get('/software/pureftpd/status');
      setStatus(resp.data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleAction = async (action: 'start' | 'stop' | 'restart') => {
    setActionLoading(action);
    try {
      await api.post(`/software/pureftpd/${action}`);
      message.success(`Pure-FTPd ${action}ed successfully`);
      setTimeout(fetchStatus, 1000);
    } catch (e: any) {
      message.error(e.response?.data?.message || `Failed to ${action} Pure-FTPd`);
    } finally {
      setActionLoading(null);
    }
  };

  const running = status?.running === true || status?.is_running === true;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY }}>Service Status</Text>
      </div>

      {loading ? <Spin /> : (
        <>
          {/* Status badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '16px 20px', borderRadius: 10,
            background: running ? '#E8F5E9' : '#FFEBEE',
            border: `1px solid ${running ? '#A5D6A7' : '#EF9A9A'}`,
            marginBottom: 24,
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: running ? SUCCESS : ERROR,
              boxShadow: `0 0 8px ${running ? SUCCESS : ERROR}50`,
            }} />
            <Text style={{ fontSize: 15, fontWeight: 600, color: running ? '#2E7D32' : '#C62828' }}>
              {running ? 'Running' : 'Stopped'}
            </Text>
            {status?.version && (
              <Text style={{ fontSize: 12, color: TEXT_SECONDARY, marginLeft: 'auto' }}>
                Version: {status.version}
              </Text>
            )}
          </div>

          {/* Action buttons */}
          <Space wrap size={12}>
            {running ? (
              <Button
                icon={<PauseCircleOutlined />}
                onClick={() => handleAction('stop')}
                loading={actionLoading === 'stop'}
                danger
                style={{ borderRadius: 6 }}
              >
                Stop
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={() => handleAction('start')}
                loading={actionLoading === 'start'}
                style={{ background: SUCCESS, borderColor: SUCCESS, borderRadius: 6 }}
              >
                Start
              </Button>
            )}
            <Button
              icon={<ReloadOutlined />}
              onClick={() => handleAction('restart')}
              loading={actionLoading === 'restart'}
              style={{ borderRadius: 6 }}
            >
              Restart
            </Button>
          </Space>

          {/* Info notices */}
          <div style={{ marginTop: 24, padding: 16, background: '#F5F5F5', borderRadius: 8, fontSize: 12, color: TEXT_SECONDARY }}>
            <p style={{ margin: '0 0 6px' }}>
              <InfoCircleOutlined style={{ marginRight: 6, color: PRIMARY }} />
              <strong>Restart</strong> — Full restart of the Pure-FTPd service
            </p>
            <p style={{ margin: 0 }}>
              <InfoCircleOutlined style={{ marginRight: 6, color: WARNING }} />
              Active FTP transfers will be interrupted during restart
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Accounts Tab
// ============================================================================
function AccountsTab({ refreshKey }: { refreshKey: number }) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addVisible, setAddVisible] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', path: '' });
  const [pwdModalRecord, setPwdModalRecord] = useState<any | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pathBrowserVisible, setPathBrowserVisible] = useState(false);
  const [treeData, setTreeData] = useState<any[]>([]);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/ftp', { params: { page: 1, per_page: 100 } });
      const items = data.data?.items || data.data || [];
      setAccounts(Array.isArray(items) ? items : []);
    } catch {
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts, refreshKey]);

  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
    return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  const handleAdd = async () => {
    if (!newUser.username || !newUser.password || !newUser.path) {
      message.warning('All fields are required');
      return;
    }
    setAddLoading(true);
    try {
      await api.post('/ftp', newUser);
      message.success('Account created');
      setNewUser({ username: '', password: '', path: '' });
      setAddVisible(false);
      fetchAccounts();
    } catch (e: any) {
      message.error(e.response?.data?.message || 'Failed to create account');
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async (record: any) => {
    try {
      await api.delete(`/ftp/${record.id}`);
      message.success('Account deleted');
      fetchAccounts();
    } catch (e: any) {
      message.error(e.response?.data?.message || 'Failed to delete');
    }
  };

  const handleToggleStatus = async (record: any) => {
    try {
      const newEnabled = record.status !== 1;
      await api.put(`/ftp/${record.id}/status`, { enabled: newEnabled });
      message.success(newEnabled ? 'Account enabled' : 'Account disabled');
      fetchAccounts();
    } catch (e: any) {
      message.error(e.response?.data?.message || 'Failed to toggle status');
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword) { message.warning('Password is required'); return; }
    if (!pwdModalRecord) return;
    setPwdLoading(true);
    try {
      await api.put(`/ftp/${pwdModalRecord.id}/password`, { password: newPassword });
      message.success('Password changed');
      setPwdModalRecord(null);
      setNewPassword('');
    } catch (e: any) {
      message.error(e.response?.data?.message || 'Failed to change password');
    } finally {
      setPwdLoading(false);
    }
  };

  const loadPathChildren = async (parentPath: string) => {
    try {
      const { data } = await api.get('/files', { params: { path: parentPath } });
      const items = data.data?.items || data.data || [];
      return items.filter((f: any) => f.is_dir).map((d: any) => ({
        title: d.name, key: d.path, isLeaf: false,
      }));
    } catch {
      return [];
    }
  };

  const onLoadTreeData = async (node: any) => {
    const children = await loadPathChildren(node.key);
    setTreeData(prev => updateTreeData(prev, node.key, children));
  };

  const updateTreeData = (list: any[], key: string, children: any[]): any[] =>
    list.map(node => {
      if (node.key === key) return { ...node, children };
      if (node.children) return { ...node, children: updateTreeData(node.children, key, children) };
      return node;
    });

  const openPathBrowser = async () => {
    const children = await loadPathChildren('/');
    setTreeData(children);
    setPathBrowserVisible(true);
  };

  const columns = [
    { title: 'Username', dataIndex: 'username', key: 'username', ellipsis: true },
    { title: 'Path', dataIndex: 'path', key: 'path', ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{v}</Text>,
    },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 90,
      render: (v: number) => (
        <Badge
          color={v === 1 ? SUCCESS : ERROR}
          text={<span style={{ fontSize: 12 }}>{v === 1 ? 'Active' : 'Disabled'}</span>}
        />
      ),
    },
    { title: 'Actions', key: 'actions', width: 150,
      render: (_: any, record: any) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => handleToggleStatus(record)}>
            {record.status === 1 ? 'Disable' : 'Enable'}
          </Button>
          <Button size="small" type="link" icon={<LockOutlined />} onClick={() => { setPwdModalRecord(record); setNewPassword(''); }} />
          <Popconfirm title="Delete this account?" onConfirm={() => handleDelete(record)}>
            <Button size="small" type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY }}>FTP Accounts</Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddVisible(true)}
          style={{ background: PRIMARY, borderColor: PRIMARY, borderRadius: 6 }} size="small">
          Add Account
        </Button>
      </div>

      <Table
        dataSource={accounts}
        columns={columns}
        rowKey="username"
        loading={loading}
        size="small"
        pagination={false}
        style={{ borderRadius: 8, overflow: 'hidden' }}
      />

      {/* Add Account Modal */}
      <Modal
        title="Add FTP Account"
        open={addVisible}
        onCancel={() => setAddVisible(false)}
        onOk={handleAdd}
        confirmLoading={addLoading}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Text style={{ fontSize: 12, color: TEXT_SECONDARY }}>Username</Text>
            <Input value={newUser.username} onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))} placeholder="ftpuser" />
          </div>
          <div>
            <Text style={{ fontSize: 12, color: TEXT_SECONDARY }}>Password</Text>
            <Space.Compact style={{ width: '100%' }}>
              <Input.Password value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} placeholder="Password" />
              <Button onClick={() => setNewUser(p => ({ ...p, password: generatePassword() }))}>Generate</Button>
            </Space.Compact>
          </div>
          <div>
            <Text style={{ fontSize: 12, color: TEXT_SECONDARY }}>Home Directory</Text>
            <Space.Compact style={{ width: '100%' }}>
              <Input value={newUser.path} onChange={e => setNewUser(p => ({ ...p, path: e.target.value }))} placeholder="/ITDLUPanel/wwwroot/site" />
              <Button icon={<FolderOutlined />} onClick={openPathBrowser}>Browse</Button>
            </Space.Compact>
          </div>
        </div>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        title={`Change password: ${pwdModalRecord?.username || ''}`}
        open={!!pwdModalRecord}
        onCancel={() => setPwdModalRecord(null)}
        onOk={handleChangePassword}
        confirmLoading={pwdLoading}
        destroyOnClose
      >
        <Space.Compact style={{ width: '100%' }}>
          <Input.Password value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password" />
          <Button onClick={() => setNewPassword(generatePassword())}>Generate</Button>
        </Space.Compact>
      </Modal>

      {/* Path Browser Modal */}
      <Modal
        title="Select Directory"
        open={pathBrowserVisible}
        onCancel={() => setPathBrowserVisible(false)}
        footer={<Button onClick={() => setPathBrowserVisible(false)}>Cancel</Button>}
        destroyOnClose
      >
        <Tree
          treeData={treeData}
          loadData={onLoadTreeData}
          onSelect={(keys) => {
            if (keys[0]) {
              setNewUser(p => ({ ...p, path: keys[0] as string }));
              setPathBrowserVisible(false);
            }
          }}
          style={{ maxHeight: 300, overflow: 'auto' }}
        />
      </Modal>
    </div>
  );
}

// ============================================================================
// Bulk Create Tab
// ============================================================================
interface BulkUser {
  username: string;
  password: string;
  path: string;
  status?: 'pending' | 'creating' | 'success' | 'error';
  error?: string;
}

function BulkCreateTab({ onCreated }: { onCreated: () => void }) {
  const [bulkUsers, setBulkUsers] = useState<BulkUser[]>([
    { username: '', password: '', path: '' },
    { username: '', password: '', path: '' },
    { username: '', password: '', path: '' },
  ]);
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkPrefix, setBulkPrefix] = useState('');
  const [bulkCount, setBulkCount] = useState(5);
  const [bulkBasePath, setBulkBasePath] = useState('/ITDLUPanel/wwwroot');
  const [bulkProgress, setBulkProgress] = useState(0);

  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
    return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  const handleQuickGenerate = () => {
    if (!bulkPrefix) { message.warning('Please enter a prefix'); return; }
    const users: BulkUser[] = [];
    for (let i = 1; i <= bulkCount; i++) {
      const num = String(i).padStart(2, '0');
      users.push({
        username: `${bulkPrefix}_${num}`,
        password: generatePassword(),
        path: `${bulkBasePath}/${bulkPrefix}_${num}`,
      });
    }
    setBulkUsers(users);
  };

  const updateRow = (index: number, field: keyof BulkUser, value: string) => {
    setBulkUsers(prev => prev.map((u, i) => i === index ? { ...u, [field]: value } : u));
  };

  const removeRow = (index: number) => {
    setBulkUsers(prev => prev.filter((_, i) => i !== index));
  };

  const addRow = () => {
    setBulkUsers(prev => [...prev, { username: '', password: '', path: '' }]);
  };

  const autoFillPasswords = () => {
    setBulkUsers(prev => prev.map(u => ({ ...u, password: u.password || generatePassword() })));
  };

  const handleBulkCreate = async () => {
    const validUsers = bulkUsers.filter(u => u.username && u.password && u.path);
    if (validUsers.length === 0) { message.warning('No valid rows to create'); return; }

    setBulkCreating(true);
    setBulkProgress(0);
    const updated = bulkUsers.map(u => ({ ...u, status: undefined as BulkUser['status'], error: undefined }));
    setBulkUsers(updated);

    let completed = 0;
    for (let i = 0; i < updated.length; i++) {
      if (!updated[i].username || !updated[i].password || !updated[i].path) continue;
      updated[i].status = 'creating';
      setBulkUsers([...updated]);
      try {
        await api.post('/ftp', {
          username: updated[i].username,
          password: updated[i].password,
          path: updated[i].path,
        });
        updated[i].status = 'success';
      } catch (err: any) {
        updated[i].status = 'error';
        updated[i].error = err?.response?.data?.message || 'Failed';
      }
      completed++;
      setBulkProgress(Math.round((completed / validUsers.length) * 100));
      setBulkUsers([...updated]);
    }
    setBulkCreating(false);
    onCreated();
  };

  const exportBulkCSV = () => {
    const successUsers = bulkUsers.filter(u => u.status === 'success');
    if (successUsers.length === 0) { message.warning('No successfully created accounts to export'); return; }
    const csv = 'Username,Password,Path\n' + successUsers.map(u => `${u.username},${u.password},${u.path}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ftp_accounts.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const successCount = bulkUsers.filter(u => u.status === 'success').length;
  const errorCount = bulkUsers.filter(u => u.status === 'error').length;
  const hasResults = successCount > 0 || errorCount > 0;

  const statusColor = (s?: BulkUser['status']) => {
    if (s === 'success') return SUCCESS;
    if (s === 'error') return ERROR;
    if (s === 'creating') return WARNING;
    return undefined;
  };

  return (
    <div>
      <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY, display: 'block', marginBottom: 16 }}>
        Bulk Create Accounts
      </Text>

      {/* Quick Generate */}
      <div style={{
        padding: 16, borderRadius: 10, marginBottom: 20,
        background: PRIMARY_LIGHT, border: `1px solid ${PRIMARY}40`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <ThunderboltOutlined style={{ color: PRIMARY }} />
          <Text style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY }}>Quick Generate</Text>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
          <div style={{ flex: 1, minWidth: 120 }}>
            <Text style={{ fontSize: 11, color: TEXT_SECONDARY, display: 'block' }}>Prefix</Text>
            <Input size="small" placeholder="student" value={bulkPrefix}
              onChange={e => setBulkPrefix(e.target.value)} />
          </div>
          <div style={{ width: 80 }}>
            <Text style={{ fontSize: 11, color: TEXT_SECONDARY, display: 'block' }}>Count</Text>
            <Input size="small" type="number" min={1} max={100} value={bulkCount}
              onChange={e => setBulkCount(Number(e.target.value) || 1)} />
          </div>
          <div style={{ flex: 2, minWidth: 180 }}>
            <Text style={{ fontSize: 11, color: TEXT_SECONDARY, display: 'block' }}>Base Path</Text>
            <Input size="small" placeholder="/ITDLUPanel/wwwroot" value={bulkBasePath}
              onChange={e => setBulkBasePath(e.target.value)} />
          </div>
          <Button size="small" type="primary" onClick={handleQuickGenerate}
            style={{ background: PRIMARY, borderColor: PRIMARY, borderRadius: 6 }}>
            Generate
          </Button>
        </div>
      </div>

      {/* Action bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Space>
          <Button size="small" icon={<PlusOutlined />} onClick={addRow}>Add Row</Button>
          <Button size="small" onClick={autoFillPasswords}>Auto-fill Passwords</Button>
        </Space>
        {hasResults && (
          <Button size="small" icon={<DownloadOutlined />} onClick={exportBulkCSV}>
            Export CSV
          </Button>
        )}
      </div>

      {/* Rows */}
      <div style={{ maxHeight: 280, overflowY: 'auto', marginBottom: 16 }}>
        {bulkUsers.map((user, i) => (
          <div key={i} style={{
            display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6,
            padding: '6px 8px', borderRadius: 6,
            background: user.status === 'error' ? '#FFEBEE' : user.status === 'success' ? '#E8F5E9' : '#FAFBFC',
            border: `1px solid ${statusColor(user.status) || BORDER}`,
          }}>
            <Input size="small" placeholder="Username" value={user.username}
              onChange={e => updateRow(i, 'username', e.target.value)}
              disabled={bulkCreating} style={{ flex: 1 }} />
            <Input.Password size="small" placeholder="Password" value={user.password}
              onChange={e => updateRow(i, 'password', e.target.value)}
              disabled={bulkCreating} style={{ flex: 1 }} />
            <Input size="small" placeholder="Path" value={user.path}
              onChange={e => updateRow(i, 'path', e.target.value)}
              disabled={bulkCreating} style={{ flex: 2 }} />
            {user.status === 'success' && <CheckCircleFilled style={{ color: SUCCESS, fontSize: 14 }} />}
            {user.status === 'error' && (
              <span title={user.error} style={{ color: ERROR, fontSize: 11, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.error}
              </span>
            )}
            {user.status === 'creating' && <Spin size="small" />}
            <Button size="small" type="text" danger icon={<MinusCircleOutlined />}
              onClick={() => removeRow(i)} disabled={bulkCreating || bulkUsers.length <= 1} />
          </div>
        ))}
      </div>

      {/* Progress */}
      {bulkCreating && (
        <Progress percent={bulkProgress} size="small" style={{ marginBottom: 12 }}
          format={p => `${p}%`} strokeColor={PRIMARY} />
      )}

      {/* Results summary */}
      {hasResults && !bulkCreating && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 12,
          background: '#F5F5F5', border: `1px solid ${BORDER}`, fontSize: 13,
        }}>
          <span style={{ color: SUCCESS, fontWeight: 600 }}>{successCount} created</span>
          {errorCount > 0 && (
            <span style={{ color: ERROR, fontWeight: 600, marginLeft: 12 }}>{errorCount} failed</span>
          )}
        </div>
      )}

      {/* Create All button */}
      <Button
        type="primary"
        block
        onClick={handleBulkCreate}
        loading={bulkCreating}
        disabled={bulkUsers.every(u => !u.username || !u.password || !u.path)}
        style={{ background: PRIMARY, borderColor: PRIMARY, borderRadius: 6 }}
      >
        {bulkCreating ? 'Creating...' : 'Create All'}
      </Button>
    </div>
  );
}

// ============================================================================
// Configuration Tab (Monaco Editor)
// ============================================================================
function ConfigTab() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: resp } = await api.get('/files/content', { params: { path: '/etc/pure-ftpd/pure-ftpd.conf' } });
        setContent(resp.data?.content || (typeof resp.data === 'string' ? resp.data : ''));
      } catch {
        setContent('# Failed to load configuration');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/files/content', { path: '/etc/pure-ftpd/pure-ftpd.conf', content });
      message.success('Config saved. Restart Pure-FTPd to apply.');
    } catch {
      message.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY }}>pure-ftpd.conf</Text>
        <Button
          type="primary"
          size="small"
          onClick={handleSave}
          loading={saving}
          style={{ background: PRIMARY, borderColor: PRIMARY, borderRadius: 6 }}
        >
          Save
        </Button>
      </div>

      {/* Tips bar */}
      <div style={{
        padding: '8px 12px', borderRadius: 6, marginBottom: 12,
        background: '#FFF8E1', border: '1px solid #FFE082', fontSize: 12, color: '#F57F17',
      }}>
        <InfoCircleOutlined style={{ marginRight: 6 }} />
        Ctrl+F Search  •  Ctrl+H Replace  •  Ctrl+S Save
      </div>

      {loading ? <Spin /> : (
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
          <Editor
            height="400px"
            defaultLanguage="ini"
            value={content}
            onChange={v => setContent(v || '')}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "'JetBrains Mono', monospace",
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
              tabSize: 4,
            }}
          />
        </div>
      )}

      {/* Warning */}
      <div style={{
        marginTop: 12, padding: '10px 12px', borderRadius: 6,
        background: '#FFF3E0', border: '1px solid #FFCC80', fontSize: 12, color: '#E65100',
      }}>
        ⚠️ This is the main configuration file of Pure-FTPd. Incorrect modifications may cause the FTP server to fail to start.
      </div>
    </div>
  );
}

// ============================================================================
// Transfer Log Tab
// ============================================================================
function TransferLogTab() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const logRef = useRef<HTMLPreElement>(null);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const { data: resp } = await api.get('/files/content', { params: { path: '/var/log/pure-ftpd/transfer.log' } });
      setContent(resp.data?.content || (typeof resp.data === 'string' ? resp.data : 'No log data'));
    } catch {
      setContent('Log file not found or empty');
    } finally {
      setLoading(false);
    }
    setTimeout(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, 100);
  }, []);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY }}>Transfer Log</Text>
          <Text style={{ fontSize: 11, color: TEXT_SECONDARY, display: 'block' }}>
            /var/log/pure-ftpd/transfer.log
          </Text>
        </div>
        <Button size="small" icon={<ReloadOutlined />} onClick={fetchLog} loading={loading}
          style={{ borderRadius: 6 }}>
          Refresh
        </Button>
      </div>

      {loading ? <Spin /> : (
        <pre
          ref={logRef}
          style={{
            background: DARK_BG,
            color: '#E0E0E0',
            padding: 16,
            borderRadius: 10,
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            lineHeight: 1.7,
            maxHeight: 420,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            margin: 0,
            border: `1px solid ${BORDER}`,
          }}
        >
          {content}
        </pre>
      )}
    </div>
  );
}
