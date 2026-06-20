import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, Modal, Form, Input, InputNumber, message, Popconfirm, Tooltip, Tree, Progress, Select } from 'antd';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined,
  FolderOpenOutlined, DeleteOutlined,
  TeamOutlined, DownloadOutlined, CloseOutlined,
  StopOutlined, PlayCircleOutlined, ExclamationCircleOutlined,
  CheckSquareOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '@/services/api';
import type { ApiResponse } from '@/types';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import RequireSoftware from '@/components/RequireSoftware';

// ─── SVG Icons ───────────────────────────────────────────────────────────────
const Icon = {
  User: ({ color, size = 16 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Folder: ({ color, size = 16 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  ),
  Lock: ({ color, size = 16 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  ),
  Trash: ({ color, size = 16 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polyline points="3,6 5,6 21,6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  ),
  Play: ({ color, size = 16 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <polygon points="10,8 16,12 10,16 10,8" fill={color} stroke="none" />
    </svg>
  ),
  Stop: ({ color, size = 16 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <rect x="9" y="9" width="6" height="6" rx="1" fill={color} stroke="none" />
    </svg>
  ),
  Chart: ({ color, size = 16 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="12" width="4" height="9" rx="1" fill={`${color}25`} />
      <rect x="10" y="7" width="4" height="14" rx="1" fill={`${color}25`} />
      <rect x="17" y="3" width="4" height="18" rx="1" fill={`${color}25`} />
      <rect x="3" y="12" width="4" height="9" rx="1" />
      <rect x="10" y="7" width="4" height="14" rx="1" />
      <rect x="17" y="3" width="4" height="18" rx="1" />
    </svg>
  ),
  Ftp: ({ color, size = 20 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="4" width="18" height="4" rx="2" fill={`${color}20`} />
      <path d="M3 8v4l9 3 9-3V8" />
      <path d="M3 12v4l9 3 9-3v-4" />
      <circle cx="12" cy="3" r="1.5" fill={color} stroke="none" />
      <circle cx="3" cy="4" r="1" fill={color} stroke="none" />
      <circle cx="21" cy="4" r="1" fill={color} stroke="none" />
    </svg>
  ),
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface FTPAccount {
  id: number;
  username: string;
  path: string;
  status: number;
  created_by: number | null;
  created_at: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
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

// ─── Sub-components ────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
  p: ReturnType<typeof usePalette>['p'];
  isDark: boolean;
}

function StatCard({ label, value, icon, color, onClick, p, isDark }: StatCardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: 1,
        minWidth: 140,
        background: p.card,
        border: `1px solid ${p.cardBorder}`,
        borderRadius: 10,
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s',
        boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
      }}
      onMouseEnter={e => {
        if (onClick) {
          (e.currentTarget as HTMLElement).style.borderColor = `${color}50`;
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = p.cardBorder;
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: `${color}15`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{
          fontSize: 11, color: p.textMuted, fontWeight: 500,
          textTransform: 'uppercase', letterSpacing: '0.04em'
        }}>
          {label}
        </div>
        <div style={{
          fontSize: 22, fontWeight: 700, color: p.text, lineHeight: 1.2, marginTop: 2
        }}>
          {value}
        </div>
      </div>
    </div>
  );
}

interface AccountRowProps {
  account: FTPAccount;
  p: ReturnType<typeof usePalette>['p'];
  isDark: boolean;
  selected: boolean;
  onSelect: () => void;
  onEditPath: () => void;
  onChangePassword: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}

function AccountRow({ account, p, isDark, selected, onSelect, onEditPath, onChangePassword, onToggleStatus, onDelete }: AccountRowProps) {
  const isActive = account.status === 1;
  const statusColor = isActive ? p.green : p.red;

  return (
    <div
      onClick={onSelect}
      style={{
        background: selected ? `${p.accent}08` : p.card,
        border: `1px solid ${selected ? p.accent : p.cardBorder}`,
        borderRadius: 10,
        padding: '14px 16px',
        transition: 'all 0.15s',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
      }}
      onMouseEnter={e => {
        if (!selected) {
          (e.currentTarget as HTMLElement).style.borderColor = `${p.accent}40`;
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={e => {
        if (!selected) {
          (e.currentTarget as HTMLElement).style.borderColor = p.cardBorder;
          (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
        }
      }}
    >
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: 3, borderRadius: '10px 0 0 10px',
        background: statusColor,
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 20, height: 20, borderRadius: 4,
          border: `2px solid ${selected ? p.accent : p.cardBorder}`,
          background: selected ? p.accent : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, transition: 'all 0.15s',
        }}>
          {selected && (
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20,6 9,17 4,12" />
            </svg>
          )}
        </div>

        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: `${p.accent}12`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon.User color={p.accent} size={14} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: p.text }}>
              {account.username}
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '2px 8px', borderRadius: 20,
              fontSize: 10.5, fontWeight: 600,
              background: `${statusColor}12`,
              color: statusColor,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor }} />
              {isActive ? 'Active' : 'Disabled'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <Icon.Folder color={p.amber} size={11} />
            <span style={{
              fontSize: 12, color: p.textMuted,
              fontFamily: 'JetBrains Mono, Consolas, monospace',
              wordBreak: 'break-all',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
            }}>
              {account.path}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11.5, color: p.textDim }}>
            {relativeTime(account.created_at)}
          </span>
        </div>

        <div style={{
          display: 'flex', gap: 4, flexShrink: 0,
          background: p.headerBg,
          borderRadius: 8,
          padding: 3,
        }}>
          <Tooltip title="Edit Path">
            <button
              onClick={(e) => { e.stopPropagation(); onEditPath(); }}
              style={{
                padding: '5px 8px', borderRadius: 6,
                border: 'none',
                background: 'transparent',
                color: p.textMuted, fontSize: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = `${p.accent}15`;
                (e.currentTarget as HTMLElement).style.color = p.accent;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
                (e.currentTarget as HTMLElement).style.color = p.textMuted;
              }}
            >
              <Icon.Folder color="currentColor" size={12} />
            </button>
          </Tooltip>
          <Tooltip title="Change Password">
            <button
              onClick={(e) => { e.stopPropagation(); onChangePassword(); }}
              style={{
                padding: '5px 8px', borderRadius: 6,
                border: 'none',
                background: 'transparent',
                color: p.textMuted, fontSize: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = `${p.amber}15`;
                (e.currentTarget as HTMLElement).style.color = p.amber;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
                (e.currentTarget as HTMLElement).style.color = p.textMuted;
              }}
            >
              <Icon.Lock color="currentColor" size={12} />
            </button>
          </Tooltip>
          <Tooltip title={isActive ? 'Disable' : 'Enable'}>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleStatus(); }}
              style={{
                padding: '5px 8px', borderRadius: 6,
                border: 'none',
                background: 'transparent',
                color: p.textMuted, fontSize: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = `${statusColor}15`;
                (e.currentTarget as HTMLElement).style.color = statusColor;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
                (e.currentTarget as HTMLElement).style.color = p.textMuted;
              }}
            >
              {isActive
                ? <Icon.Stop color="currentColor" size={12} />
                : <Icon.Play color="currentColor" size={12} />
              }
            </button>
          </Tooltip>
          <Popconfirm
            title="Delete this account?"
            onConfirm={(e) => { e?.stopPropagation(); onDelete(); }}
            okText="Yes"
            cancelText="No"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Delete">
              <button
                onClick={(e) => e.stopPropagation()}
                style={{
                  padding: '5px 8px', borderRadius: 6,
                  border: 'none',
                  background: 'transparent',
                  color: p.textMuted, fontSize: 12, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = `${p.red}15`;
                  (e.currentTarget as HTMLElement).style.color = p.red;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.color = p.textMuted;
                }}
              >
                <Icon.Trash color="currentColor" size={12} />
              </button>
            </Tooltip>
          </Popconfirm>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
function FTPContent() {
  const { t } = useTranslation();
  const { p, isDark } = usePalette();
  const isMobile = useIsMobile();

  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<FTPAccount[]>([]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [refreshKey, setRefreshKey] = useState(0);

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

  // Bulk create
  interface BulkUser { username: string; password: string; path: string; status?: 'pending' | 'creating' | 'success' | 'error'; error?: string; }
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkUsers, setBulkUsers] = useState<BulkUser[]>([{ username: '', password: '', path: '' }, { username: '', password: '', path: '' }, { username: '', password: '', path: '' }]);
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkPrefix, setBulkPrefix] = useState('');
  const [bulkCount, setBulkCount] = useState(5);
  const [bulkBasePath, setBulkBasePath] = useState('/ITDLUPanel/wwwroot');

  // Multi-select
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchPathOpen, setBatchPathOpen] = useState(false);
  const [batchPathForm] = Form.useForm();

  // ─── Data ──────────────────────────────────────────────────────────────────
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

  useEffect(() => { fetchAccounts(); }, [fetchAccounts, refreshKey]);

  const filteredAccounts = useMemo(() => {
    let result = accounts;
    if (statusFilter === 'active') result = result.filter(a => a.status === 1);
    if (statusFilter === 'disabled') result = result.filter(a => a.status !== 1);
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(a => a.username.toLowerCase().includes(q) || a.path.toLowerCase().includes(q));
    }
    return result;
  }, [accounts, searchText, statusFilter]);

  const totalAccounts = accounts.length;
  const activeAccounts = accounts.filter(a => a.status === 1).length;
  const disabledAccounts = accounts.length - activeAccounts;

  // ─── Handlers ──────────────────────────────────────────────────────────────
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

  // ─── Path browser ─────────────────────────────────────────────────────────
  const onPathTreeLoad = (node: any): Promise<void> =>
    new Promise(async (resolve) => {
      if (node.children) { resolve(); return; }
      const children = await loadPathChildren(node.key);
      setPathTreeData(prev => {
        const update = (nodes: any[]): any[] =>
          nodes.map(n =>
            n.key === node.key
              ? { ...n, children: children.length ? children : [{ title: '(empty)', key: `${node.key}/__empty`, isLeaf: true, disabled: true, selectable: false }] }
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

  // ─── Bulk create ───────────────────────────────────────────────────────────
  const handleQuickGenerate = () => {
    if (!bulkPrefix) { message.warning('Enter a prefix'); return; }
    const users: BulkUser[] = [];
    for (let i = 1; i <= bulkCount; i++) {
      const num = String(i).padStart(2, '0');
      users.push({ username: `${bulkPrefix}_${num}`, password: generatePassword(), path: `${bulkBasePath}/${bulkPrefix}_${num}` });
    }
    setBulkUsers(users);
  };

  const handleAutoFillPasswords = () => {
    setBulkUsers(prev => prev.map(u => ({ ...u, password: u.password || generatePassword() })));
  };

  const addBulkRow = () => setBulkUsers(prev => [...prev, { username: '', password: '', path: '' }]);
  const removeBulkRow = (idx: number) => setBulkUsers(prev => prev.filter((_, i) => i !== idx));
  const updateBulkRow = (idx: number, field: keyof BulkUser, val: string) => {
    setBulkUsers(prev => prev.map((u, i) => i === idx ? { ...u, [field]: val } : u));
  };

  const handleBulkCreate = async () => {
    const valid = bulkUsers.filter(u => u.username && u.password && u.path);
    if (!valid.length) { message.warning('No valid rows to create'); return; }
    setBulkCreating(true);
    const updated = bulkUsers.map(u => ({ ...u, status: (u.username && u.password && u.path ? 'pending' : undefined) as BulkUser['status'] }));
    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status !== 'pending') continue;
      updated[i].status = 'creating';
      setBulkUsers([...updated]);
      try {
        await api.post('/ftp', { username: updated[i].username, password: updated[i].password, path: updated[i].path });
        updated[i].status = 'success';
      } catch (err: any) {
        updated[i].status = 'error';
        updated[i].error = err?.response?.data?.message || 'Failed';
      }
      setBulkUsers([...updated]);
    }
    setBulkCreating(false);
    fetchAccounts();
    const ok = updated.filter(u => u.status === 'success').length;
    const fail = updated.filter(u => u.status === 'error').length;
    message.info(`Created ${ok} account(s)${fail ? `, ${fail} failed` : ''}`);
  };

  const exportBulkCSV = () => {
    const rows = bulkUsers.filter(u => u.status === 'success');
    if (!rows.length) { message.warning('No successful accounts to export'); return; }
    const csv = 'Username,Password,Path\n' + rows.map(u => `${u.username},${u.password},${u.path}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'ftp_accounts.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const bulkDone = bulkUsers.some(u => u.status === 'success' || u.status === 'error');
  const bulkProgress = bulkUsers.filter(u => u.status === 'success' || u.status === 'error').length;
  const bulkTotal = bulkUsers.filter(u => u.username && u.password && u.path).length;

  // ─── Batch ─────────────────────────────────────────────────────────────────
  const selectedIds = selectedRowKeys.map(Number);

  const handleBatchDelete = () => {
    Modal.confirm({
      title: 'Delete Selected Accounts',
      icon: <ExclamationCircleOutlined />,
      content: `Are you sure you want to delete ${selectedIds.length} account(s)? This action cannot be undone.`,
      okText: 'Delete All',
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        setBatchLoading(true);
        try {
          const { data } = await api.post('/ftp/batch/delete', { ids: selectedIds });
          message.success(data.data?.message || 'Done');
          setSelectedRowKeys([]);
          fetchAccounts();
        } catch {
          message.error(t('common.error'));
        } finally {
          setBatchLoading(false);
        }
      },
    });
  };

  const handleBatchStatus = async (enabled: boolean) => {
    setBatchLoading(true);
    try {
      const { data } = await api.post('/ftp/batch/status', { ids: selectedIds, enabled });
      message.success(data.data?.message || 'Done');
      setSelectedRowKeys([]);
      fetchAccounts();
    } catch {
      message.error(t('common.error'));
    } finally {
      setBatchLoading(false);
    }
  };

  const handleBatchPath = async (values: { path: string }) => {
    setBatchLoading(true);
    try {
      const { data } = await api.post('/ftp/batch/path', { ids: selectedIds, path: values.path });
      message.success(data.data?.message || 'Done');
      setSelectedRowKeys([]);
      setBatchPathOpen(false);
      batchPathForm.resetFields();
      fetchAccounts();
    } catch {
      message.error(t('common.error'));
    } finally {
      setBatchLoading(false);
    }
  };

  const hasSelection = selectedRowKeys.length > 0;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: isMobile ? 12 : 24 }}>
      {/* ── Main Container ───────────────────────────────────────────────── */}
      <div style={{
        background: p.card, borderRadius: 12,
        border: `1px solid ${p.cardBorder}`,
        boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: `1px solid ${p.cardBorder}`,
          background: p.headerBg,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: `${p.accent}12`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon.Ftp color={p.accent} size={20} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: p.text }}>FTP Accounts</div>
              <div style={{ fontSize: 12, color: p.textMuted, marginTop: 1 }}>
                Manage FTP access accounts for your server
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              icon={<TeamOutlined />}
              onClick={() => {
                setBulkOpen(true);
                setBulkUsers([{ username: '', password: '', path: '' }, { username: '', password: '', path: '' }, { username: '', password: '', path: '' }]);
              }}
              style={{
                borderColor: p.accent, color: p.accent,
                background: 'transparent', borderRadius: 8,
              }}
            >
              Bulk Create
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
              style={{
                background: p.accent, borderColor: p.accent, borderRadius: 8,
              }}
            >
              Add Account
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div style={{
          padding: '12px 20px', borderBottom: `1px solid ${p.cardBorder}`,
          display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
          background: p.card,
        }}>
          <Input
            placeholder="Search accounts..."
            prefix={<SearchOutlined style={{ color: p.textMuted, fontSize: 13 }} />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            allowClear
            size="middle"
            style={{
              width: isMobile ? 140 : 220,
              background: p.inputBg,
              border: `1px solid ${p.cardBorder}`,
              borderRadius: 8,
              color: p.text,
              fontSize: 13,
            }}
          />
          <Select
            value={statusFilter}
            onChange={v => setStatusFilter(v as 'all' | 'active' | 'disabled')}
            style={{ width: isMobile ? 120 : 140 }}
            size="middle"
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'active', label: 'Active' },
              { value: 'disabled', label: 'Disabled' },
            ]}
          />
          <div style={{ flex: 1 }} />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => { setRefreshKey(k => k + 1); }}
            style={{
              borderColor: p.cardBorder, color: p.textMuted,
              background: 'transparent', borderRadius: 8,
            }}
          >
            Refresh
          </Button>
        </div>

        {/* Stats Row */}
        <div style={{
          display: 'flex', gap: 12, padding: '16px 20px',
          flexWrap: 'wrap',
          background: p.card,
        }}>
          <StatCard
            label="Total"
            value={totalAccounts}
            icon={<Icon.Chart color={p.accent} size={18} />}
            color={p.accent}
            p={p}
            isDark={isDark}
          />
          <StatCard
            label="Active"
            value={activeAccounts}
            icon={<Icon.Play color={p.green} size={18} />}
            color={p.green}
            p={p}
            isDark={isDark}
          />
          <StatCard
            label="Disabled"
            value={disabledAccounts}
            icon={<Icon.Stop color={p.textDim} size={18} />}
            color={p.textDim}
            p={p}
            isDark={isDark}
          />
        </div>

        {/* Batch Actions */}
        {hasSelection && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            padding: '10px 20px',
            background: `${p.accent}08`,
            borderBottom: `1px solid ${p.accent}20`,
          }}>
            <CheckSquareOutlined style={{ color: p.accent, fontSize: 14 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>
              {selectedRowKeys.length} selected
            </span>
            <div style={{ width: 1, height: 20, background: `${p.accent}30`, margin: '0 4px' }} />
            <Button size="small" icon={<PlayCircleOutlined />} loading={batchLoading}
              onClick={() => handleBatchStatus(true)}
              style={{ borderColor: p.green, color: p.green, background: 'transparent', borderRadius: 7 }}
            >
              Enable
            </Button>
            <Button size="small" icon={<StopOutlined />} loading={batchLoading}
              onClick={() => handleBatchStatus(false)}
              style={{ borderColor: p.textDim, color: p.textDim, background: 'transparent', borderRadius: 7 }}
            >
              Disable
            </Button>
            <Button size="small" icon={<FolderOpenOutlined />} loading={batchLoading}
              onClick={() => setBatchPathOpen(true)}
              style={{ borderColor: p.accent, color: p.accent, background: 'transparent', borderRadius: 7 }}
            >
              Change Path
            </Button>
            <Button size="small" danger icon={<DeleteOutlined />} loading={batchLoading}
              onClick={handleBatchDelete}
              style={{ borderRadius: 7 }}
            >
              Delete
            </Button>
            <div style={{ flex: 1 }} />
            <Button type="link" size="small"
              onClick={() => setSelectedRowKeys([])}
              style={{ color: p.textMuted, fontSize: 12 }}
            >
              Clear
            </Button>
          </div>
        )}

        {/* Account List */}
        <div style={{ padding: '12px 20px 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                border: `3px solid ${p.cardBorder}`,
                borderTopColor: p.accent,
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 12px',
              }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <span style={{ color: p.textMuted, fontSize: 13 }}>Loading accounts...</span>
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '48px 24px',
              background: p.card,
              borderRadius: 10,
              border: `1px dashed ${p.cardBorder}`,
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: `${p.accent}08`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 14px',
              }}>
                <Icon.User color={p.textDim} size={24} />
              </div>
              <div style={{ color: p.text, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                {searchText || statusFilter !== 'all' ? 'No matching accounts' : 'No FTP accounts yet'}
              </div>
              <div style={{ color: p.textMuted, fontSize: 13 }}>
                {searchText || statusFilter !== 'all'
                  ? 'Try adjusting your search or filter'
                  : 'Create your first FTP account to get started'}
              </div>
              {!searchText && statusFilter === 'all' && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setCreateOpen(true)}
                  style={{
                    marginTop: 16, background: p.accent, borderColor: p.accent, borderRadius: 8,
                  }}
                >
                  Create Account
                </Button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Column Headers */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '0 0 4px 54px',
                fontSize: 11, fontWeight: 600, color: p.textDim,
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                <span style={{ flex: 1 }}>Username</span>
                <span style={{ width: 80, textAlign: 'right' }}>Created</span>
                <span style={{ width: 140 }}>Actions</span>
              </div>
              {filteredAccounts.map(account => (
                <AccountRow
                  key={account.id}
                  account={account}
                  p={p}
                  isDark={isDark}
                  selected={selectedRowKeys.includes(account.id)}
                  onSelect={() => {
                    setSelectedRowKeys(prev =>
                      prev.includes(account.id)
                        ? prev.filter(k => k !== account.id)
                        : [...prev, account.id]
                    );
                  }}
                  onEditPath={() => {
                    setSelectedAccount(account);
                    editPathForm.setFieldsValue({ path: account.path });
                    setEditPathOpen(true);
                  }}
                  onChangePassword={() => {
                    setSelectedAccount(account);
                    setPasswordOpen(true);
                  }}
                  onToggleStatus={() => handleToggleStatus(account)}
                  onDelete={() => handleDelete(account.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ============ Modals ============ */}

      {/* Add FTP Account */}
      <Modal
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon.User color={p.accent} size={16} />
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
            <Input
              placeholder="ftpuser"
              prefix={<Icon.User color={p.textDim} size={13} />}
              style={{ background: p.inputBg, borderColor: p.cardBorder }}
            />
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
            <Input.Password placeholder="••••••••" style={{ background: p.inputBg, borderColor: p.cardBorder }} />
          </Form.Item>
          <Form.Item
            name="path"
            label="Home Directory"
            rules={[{ required: true, message: 'Path is required' }]}
            extra={<span style={{ fontSize: 11, color: p.textMuted }}>Absolute path, e.g. /home/ftpuser or /var/www/html</span>}
          >
            <Input
              placeholder="/home/ftpuser"
              prefix={<Icon.Folder color={p.textDim} size={13} />}
              addonAfter={
                <FolderOpenOutlined
                  style={{ cursor: 'pointer', color: p.accent }}
                  onClick={() => openPathBrowser('create')}
                />
              }
              style={{ background: p.inputBg, borderColor: p.cardBorder }}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Change Password */}
      <Modal
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon.Lock color={p.amber} size={16} />
            Change Password — <code style={{ fontSize: 13, color: p.accent, fontFamily: 'JetBrains Mono, monospace' }}>{selectedAccount?.username ?? ''}</code>
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
            <Input.Password placeholder="••••••••" style={{ background: p.inputBg, borderColor: p.cardBorder }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Path */}
      <Modal
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon.Folder color={p.accent} size={16} />
            Edit Path — <code style={{ fontSize: 13, color: p.accent, fontFamily: 'JetBrains Mono, monospace' }}>{selectedAccount?.username ?? ''}</code>
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
              fontFamily: 'JetBrains Mono, monospace',
            }}>
              Current: <span style={{ color: p.text }}>{selectedAccount.path}</span>
            </div>
          )}
          <Form.Item
            name="path"
            label="New Path"
            rules={[{ required: true, message: 'Path is required' }]}
          >
            <Input
              placeholder="/home/ftpuser"
              prefix={<Icon.Folder color={p.textDim} size={13} />}
              addonAfter={
                <FolderOpenOutlined
                  style={{ cursor: 'pointer', color: p.accent }}
                  onClick={() => openPathBrowser('edit')}
                />
              }
              style={{ background: p.inputBg, borderColor: p.cardBorder }}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Path Browser */}
      <Modal
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon.Folder color={p.accent} size={16} />
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
          Selected: <code style={{ color: p.accent, fontFamily: 'JetBrains Mono, monospace' }}>{pathBrowserSelected}</code>
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

      {/* Bulk Create */}
      <Modal
        title={<span><TeamOutlined style={{ color: p.accent, marginRight: 8 }} />Bulk Create FTP Accounts</span>}
        open={bulkOpen}
        onCancel={() => { if (!bulkCreating) { setBulkOpen(false); } }}
        footer={null}
        width={720}
        destroyOnHidden
      >
        <div style={{ background: p.codeBg, borderRadius: 8, padding: 12, marginBottom: 12, border: `1px solid ${p.cardBorder}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: p.textMuted, marginBottom: 8 }}>Quick Generate</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 2 }}>Prefix</div>
              <Input size="small" placeholder="student" value={bulkPrefix} onChange={e => setBulkPrefix(e.target.value)} style={{ width: 120, background: p.inputBg }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 2 }}>Count</div>
              <InputNumber size="small" min={1} max={100} value={bulkCount} onChange={v => setBulkCount(v || 5)} style={{ width: 70 }} />
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 2 }}>Base Path</div>
              <Input size="small" value={bulkBasePath} onChange={e => setBulkBasePath(e.target.value)} style={{ background: p.inputBg }} />
            </div>
            <Button size="small" type="primary" onClick={handleQuickGenerate} style={{ background: p.accent, borderColor: p.accent }}>Generate</Button>
          </div>
        </div>

        <div style={{ maxHeight: 320, overflow: 'auto', marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr 28px', gap: 4, fontSize: 11, fontWeight: 600, color: p.textMuted, marginBottom: 4, paddingRight: 4 }}>
            <span>Username</span><span>Password</span><span>Path</span><span />
          </div>
          {bulkUsers.map((u, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr 28px', gap: 4, marginBottom: 4, alignItems: 'center' }}>
              <Input size="small" value={u.username} onChange={e => updateBulkRow(i, 'username', e.target.value)}
                placeholder="username" disabled={bulkCreating}
                style={{ background: u.status === 'success' ? `${p.green}15` : u.status === 'error' ? `${p.red}15` : p.inputBg }} />
              <Input size="small" value={u.password} onChange={e => updateBulkRow(i, 'password', e.target.value)}
                placeholder="password" disabled={bulkCreating}
                style={{ background: p.inputBg }} />
              <Input size="small" value={u.path} onChange={e => updateBulkRow(i, 'path', e.target.value)}
                placeholder="/path" disabled={bulkCreating}
                style={{ background: p.inputBg }}
                suffix={u.status === 'success' ? <span style={{ color: p.green }}>✓</span> : u.status === 'error' ? <Tooltip title={u.error}><span style={{ color: p.red }}>✗</span></Tooltip> : null} />
              {!bulkCreating && <Button type="text" size="small" icon={<CloseOutlined style={{ fontSize: 10 }} />} onClick={() => removeBulkRow(i)} disabled={bulkUsers.length <= 1} />}
            </div>
          ))}
        </div>

        {bulkCreating && <Progress percent={Math.round((bulkProgress / bulkTotal) * 100)} size="small" style={{ marginBottom: 8 }} />}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="small" onClick={addBulkRow} disabled={bulkCreating}>+ Add Row</Button>
            <Button size="small" onClick={handleAutoFillPasswords} disabled={bulkCreating}>Fill Passwords</Button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {bulkDone && <Button size="small" icon={<DownloadOutlined />} onClick={exportBulkCSV}>Export CSV</Button>}
            <Button type="primary" size="small" onClick={handleBulkCreate} loading={bulkCreating}
              style={{ background: p.accent, borderColor: p.accent }}>
              {bulkCreating ? 'Creating...' : `Create ${bulkTotal} Account(s)`}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Batch Change Path */}
      <Modal
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon.Folder color={p.accent} size={16} />
            Change Path — {selectedRowKeys.length} account(s)
          </span>
        }
        open={batchPathOpen}
        onCancel={() => { setBatchPathOpen(false); batchPathForm.resetFields(); }}
        onOk={() => batchPathForm.submit()}
        confirmLoading={batchLoading}
        okText="Update All"
        cancelText={t('common.cancel')}
        destroyOnHidden
        width={isMobile ? '95%' : 480}
        okButtonProps={{ style: { background: p.accent, borderColor: p.accent } }}
      >
        <div style={{
          fontSize: 12, color: p.textMuted, marginBottom: 12, marginTop: 8,
          padding: '8px 12px', background: p.codeBg, borderRadius: 6,
        }}>
          This will change the home directory for all <strong>{selectedRowKeys.length}</strong> selected account(s) to the same path.
        </div>
        <Form form={batchPathForm} layout="vertical" onFinish={handleBatchPath} size="small">
          <Form.Item
            name="path"
            label="New Path"
            rules={[{ required: true, message: 'Path is required' }]}
          >
            <Input
              placeholder="/ITDLUPanel/wwwroot/shared"
              prefix={<Icon.Folder color={p.textDim} size={13} />}
              addonAfter={
                <FolderOpenOutlined
                  style={{ cursor: 'pointer', color: p.accent }}
                  onClick={() => openPathBrowser('edit')}
                />
              }
              style={{ background: p.inputBg, borderColor: p.cardBorder }}
            />
          </Form.Item>
        </Form>
      </Modal>
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
