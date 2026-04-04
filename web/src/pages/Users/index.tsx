import { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Modal, Form, Input, Select, message, Popconfirm, Tree, Tooltip, Badge } from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, KeyOutlined, ReloadOutlined,
  LockOutlined, UnlockOutlined, SafetyCertificateOutlined, TeamOutlined,
  CrownOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePalette } from '@/hooks/usePalette';
import api from '@/services/api';
import type { User, Role, PermissionGroup } from '@/types';
import { formatDateTime } from '@/lib/datetime';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const ROLE_COLORS: Record<string, string> = {
  admin: '#E53935', operator: '#1565C0', viewer: '#43A047',
};

function getRoleColor(role: string, accent: string): string {
  return ROLE_COLORS[role] || accent;
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

export default function Users() {
  const { t } = useTranslation();
  const { p, isDark } = usePalette();

  // Tab state
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');

  // Users state
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [pwForm] = Form.useForm();

  // Roles state
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [permissionTree, setPermissionTree] = useState<PermissionGroup[]>([]);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleForm] = Form.useForm();
  const [checkedPerms, setCheckedPerms] = useState<string[]>([]);

  /* ---------------------------------------------------------------- */
  /*  Data fetching                                                   */
  /* ---------------------------------------------------------------- */

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data: resp } = await api.get('/users');
      setUsers(resp.data || []);
    } catch {
      message.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRoles = useCallback(async () => {
    setRolesLoading(true);
    try {
      const [rolesResp, treeResp] = await Promise.all([
        api.get('/roles'),
        api.get('/roles/permissions'),
      ]);
      setRoles(rolesResp.data.data || []);
      setPermissionTree(treeResp.data.data || []);
    } catch {
      message.error('Failed to load roles');
    } finally {
      setRolesLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); fetchRoles(); }, [fetchUsers, fetchRoles]);

  /* ---------------------------------------------------------------- */
  /*  Permission tree helpers                                         */
  /* ---------------------------------------------------------------- */

  const allLeafKeys = useMemo(
    () => permissionTree.flatMap((g) => g.permissions.map((pp) => pp.key)),
    [permissionTree],
  );

  const treeData = useMemo(() => permissionTree.map((group) => ({
    title: group.label,
    key: group.key,
    children: group.permissions.map((perm) => ({
      title: perm.label,
      key: perm.key,
    })),
  })), [permissionTree]);

  const handleTreeCheck = (checked: unknown) => {
    const keys = Array.isArray(checked) ? checked as string[] : (checked as { checked: string[] }).checked;
    setCheckedPerms(keys.filter((k) => allLeafKeys.includes(k)));
  };

  const permSummary = (perms: string[]) => {
    if (!perms || perms.length === 0) return '—';
    if (perms.includes('*')) return 'Full Access';
    // Check for wildcard groups
    const wildcards = perms.filter(p => p.endsWith('.*')).map(p => p.replace('.*', ''));
    const specific = perms.filter(p => !p.endsWith('.*'));
    const parts: string[] = [];
    if (wildcards.length > 0) parts.push(wildcards.join(', ') + ' (all)');
    if (specific.length > 0) parts.push(`${specific.length} specific`);
    return parts.join(' + ');
  };

  /* ---------------------------------------------------------------- */
  /*  Role options for user forms                                     */
  /* ---------------------------------------------------------------- */

  const roleOptions = useMemo(() =>
    roles.map(r => ({
      value: r.name,
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {r.is_system && <CrownOutlined style={{ color: getRoleColor(r.name, p.accent), fontSize: 11 }} />}
          <span>{r.name}</span>
          <span style={{ color: p.textDim, fontSize: 11, marginLeft: 'auto' }}>
            {r.is_system ? 'System' : 'Custom'}
          </span>
        </span>
      ),
    })),
    [roles, p.accent, p.textDim],
  );

  /* ---------------------------------------------------------------- */
  /*  User CRUD handlers                                              */
  /* ---------------------------------------------------------------- */

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      await api.post('/users', values);
      message.success(t('common.success'));
      setModalOpen(false);
      form.resetFields();
      fetchUsers();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { message?: string } } };
        message.error(axiosErr.response?.data?.message || 'Failed to create user');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    try {
      const values = await editForm.validateFields();
      setSubmitting(true);
      await api.put(`/users/${selectedUser?.id}`, values);
      message.success(t('common.success'));
      setEditModalOpen(false);
      editForm.resetFields();
      fetchUsers();
    } catch {
      message.error('Failed to update user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    try {
      const values = await pwForm.validateFields();
      setSubmitting(true);
      await api.put(`/users/${selectedUser?.id}/password`, { password: values.password });
      message.success('Password reset successfully');
      setPasswordModalOpen(false);
      pwForm.resetFields();
    } catch {
      message.error('Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/users/${id}`);
      message.success(t('common.success'));
      fetchUsers();
    } catch {
      message.error('Failed to delete user');
    }
  };

  const handleToggleStatus = async (user: User) => {
    try {
      await api.put(`/users/${user.id}`, { status: user.status === 1 ? 0 : 1 });
      message.success(t('common.success'));
      fetchUsers();
    } catch {
      message.error('Failed to update status');
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Role CRUD handlers                                              */
  /* ---------------------------------------------------------------- */

  const openRoleModal = (role?: Role) => {
    if (role) {
      setEditingRole(role);
      roleForm.setFieldsValue({ name: role.name, description: role.description });
      // Expand wildcard permissions to leaf keys for the tree
      const expanded: string[] = [];
      for (const perm of role.permissions) {
        if (perm === '*') {
          expanded.push(...allLeafKeys);
          break;
        } else if (perm.endsWith('.*')) {
          const prefix = perm.replace('.*', '');
          const group = permissionTree.find(g => g.key === prefix);
          if (group) expanded.push(...group.permissions.map(pp => pp.key));
        } else {
          expanded.push(perm);
        }
      }
      setCheckedPerms([...new Set(expanded)]);
    } else {
      setEditingRole(null);
      roleForm.resetFields();
      setCheckedPerms([]);
    }
    setRoleModalOpen(true);
  };

  const handleSaveRole = async () => {
    try {
      const values = await roleForm.validateFields();
      setSubmitting(true);

      // Compress permissions: if all children of a group are selected, use group.*
      const compressed: string[] = [];
      for (const group of permissionTree) {
        const groupLeafs = group.permissions.map(pp => pp.key);
        const allSelected = groupLeafs.every(k => checkedPerms.includes(k));
        if (allSelected && groupLeafs.length > 0) {
          compressed.push(`${group.key}.*`);
        } else {
          compressed.push(...groupLeafs.filter(k => checkedPerms.includes(k)));
        }
      }
      // If ALL permissions selected, use *
      const allGroupsWildcard = permissionTree.every(g =>
        compressed.includes(`${g.key}.*`)
      );
      const perms = allGroupsWildcard ? ['*'] : compressed;

      if (editingRole) {
        await api.put(`/roles/${editingRole.id}`, {
          name: editingRole.is_system ? editingRole.name : values.name,
          description: values.description,
          permissions: perms,
        });
        message.success('Role updated');
      } else {
        await api.post('/roles', {
          name: values.name,
          description: values.description,
          permissions: perms,
        });
        message.success('Role created');
      }
      setRoleModalOpen(false);
      roleForm.resetFields();
      setCheckedPerms([]);
      fetchRoles();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { message?: string } } };
        message.error(axiosErr.response?.data?.message || 'Failed to save role');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRole = async (id: number) => {
    try {
      await api.delete(`/roles/${id}`);
      message.success('Role deleted');
      fetchRoles();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { message?: string } } };
        message.error(axiosErr.response?.data?.message || 'Failed to delete role');
      }
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Style constants                                                 */
  /* ---------------------------------------------------------------- */

  const btnOutline: React.CSSProperties = {
    padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
    background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
  };
  const btnPrimary: React.CSSProperties = {
    padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
    background: p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
  };
  const btnAction: React.CSSProperties = {
    padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
    background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 4,
  };
  const btnDanger: React.CSSProperties = {
    padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.red}30`,
    background: 'transparent', color: p.red, fontSize: 11, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 4,
  };
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px', borderRadius: 6, border: 'none', cursor: 'pointer',
    background: active ? p.accent : 'transparent',
    color: active ? '#fff' : p.textMuted,
    fontSize: 13, fontWeight: active ? 600 : 400,
    display: 'flex', alignItems: 'center', gap: 6,
    transition: 'all 0.2s',
  });

  /* ---------------------------------------------------------------- */
  /*  User table columns                                              */
  /* ---------------------------------------------------------------- */

  const userColumns = [
    {
      title: t('auth.username'), dataIndex: 'username', key: 'username',
      render: (v: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 14, background: `${p.accent}20`,
            color: p.accent, fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {v?.charAt(0).toUpperCase()}
          </div>
          <span style={{ fontWeight: 500, color: p.text, fontSize: 13 }}>{v}</span>
        </div>
      ),
    },
    {
      title: 'Email', dataIndex: 'email', key: 'email',
      render: (v: string) => <span style={{ fontSize: 13, color: v ? p.text : p.textDim }}>{v || '—'}</span>,
    },
    {
      title: 'Role', dataIndex: 'role', key: 'role',
      render: (role: string) => {
        const c = getRoleColor(role, p.accent);
        return (
          <span style={{
            padding: '2px 9px', borderRadius: 4, fontSize: 11, fontWeight: 500,
            background: c + '15', color: c,
          }}>
            {role?.toUpperCase()}
          </span>
        );
      },
    },
    {
      title: t('common.status'), key: 'status',
      render: (_: unknown, r: User) => {
        const active = r.status === 1;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 6, height: 6, borderRadius: 3,
              background: active ? p.green : p.red,
              display: 'inline-block', flexShrink: 0,
            }} />
            <span style={{ fontSize: 12, color: p.textMuted }}>
              {active ? t('common.active') : t('common.inactive')}
            </span>
          </div>
        );
      },
    },
    {
      title: 'Last Login', dataIndex: 'last_login', key: 'last_login',
      render: (v: string) => (
        <span style={{ fontSize: 12, color: p.textMuted }}>
          {v ? formatDateTime(v) : 'Never'}
        </span>
      ),
    },
    {
      title: t('common.actions'), key: 'actions',
      render: (_: unknown, r: User) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Tooltip title="Edit">
            <button style={btnAction} onClick={() => {
              setSelectedUser(r);
              editForm.setFieldsValue({ username: r.username, email: r.email, role: r.role });
              setEditModalOpen(true);
            }}>
              <EditOutlined />
            </button>
          </Tooltip>
          <Tooltip title="Reset Password">
            <button style={btnAction} onClick={() => { setSelectedUser(r); setPasswordModalOpen(true); }}>
              <KeyOutlined />
            </button>
          </Tooltip>
          <Tooltip title={r.status === 1 ? t('common.disable') : t('common.enable')}>
            <button style={btnAction} onClick={() => handleToggleStatus(r)}>
              {r.status === 1 ? <LockOutlined /> : <UnlockOutlined />}
            </button>
          </Tooltip>
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(r.id)} okText={t('common.yes')} cancelText={t('common.no')}>
            <button style={btnDanger}><DeleteOutlined /></button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  /* ---------------------------------------------------------------- */
  /*  Role table columns                                              */
  /* ---------------------------------------------------------------- */

  const roleColumns = [
    {
      title: 'Role', dataIndex: 'name', key: 'name',
      render: (name: string, r: Role) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {r.is_system && <CrownOutlined style={{ color: getRoleColor(name, p.accent), fontSize: 13 }} />}
          <span style={{ fontWeight: 500, color: p.text, fontSize: 13 }}>{name}</span>
          {r.is_system && (
            <span style={{
              fontSize: 9, padding: '1px 5px', borderRadius: 3,
              background: `${p.textDim}15`, color: p.textDim,
            }}>SYSTEM</span>
          )}
        </div>
      ),
    },
    {
      title: 'Description', dataIndex: 'description', key: 'description',
      render: (v: string) => <span style={{ fontSize: 13, color: p.textMuted }}>{v || '—'}</span>,
    },
    {
      title: 'Permissions', dataIndex: 'permissions', key: 'permissions',
      render: (perms: string[]) => (
        <span style={{ fontSize: 12, color: p.textMuted }}>
          {permSummary(perms)}
        </span>
      ),
    },
    {
      title: 'Users', key: 'user_count',
      width: 70,
      render: (_: unknown, r: Role) => {
        const count = users.filter(u => u.role === r.name).length;
        return (
          <Badge count={count} showZero style={{
            backgroundColor: count > 0 ? p.accent : `${p.textDim}30`,
            fontSize: 11,
          }} />
        );
      },
    },
    {
      title: t('common.actions'), key: 'actions', width: 120,
      render: (_: unknown, r: Role) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Tooltip title="Edit Permissions">
            <button style={btnAction} onClick={() => openRoleModal(r)}>
              <EditOutlined />
            </button>
          </Tooltip>
          {!r.is_system && (
            <Popconfirm title="Delete this role?" onConfirm={() => handleDeleteRole(r.id)} okText="Yes" cancelText="No">
              <button style={btnDanger}><DeleteOutlined /></button>
            </Popconfirm>
          )}
        </div>
      ),
    },
  ];

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div style={{
      background: p.card, borderRadius: 12,
      border: `1px solid ${p.cardBorder}`,
      boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>
      {/* Header with tabs */}
      <div style={{
        padding: '14px 20px',
        borderBottom: `1px solid ${p.cardBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: p.headerBg, flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 4, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderRadius: 8, padding: 3 }}>
          <button style={tabStyle(activeTab === 'users')} onClick={() => setActiveTab('users')}>
            <TeamOutlined style={{ fontSize: 13 }} /> Users
          </button>
          <button style={tabStyle(activeTab === 'roles')} onClick={() => setActiveTab('roles')}>
            <SafetyCertificateOutlined style={{ fontSize: 13 }} /> Roles & Permissions
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btnOutline} onClick={() => { fetchUsers(); fetchRoles(); }}><ReloadOutlined /></button>
          {activeTab === 'users' ? (
            <button style={btnPrimary} onClick={() => setModalOpen(true)}>
              <PlusOutlined style={{ marginRight: 6 }} />Add User
            </button>
          ) : (
            <button style={btnPrimary} onClick={() => openRoleModal()}>
              <PlusOutlined style={{ marginRight: 6 }} />New Role
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: 20 }}>
        {activeTab === 'users' ? (
          <Table
            columns={userColumns}
            dataSource={users}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10, showTotal: total => `${t('common.total')}: ${total}` }}
            scroll={{ x: 500 }}
          />
        ) : (
          <Table
            columns={roleColumns}
            dataSource={roles}
            rowKey="id"
            loading={rolesLoading}
            pagination={false}
            scroll={{ x: 500 }}
          />
        )}
      </div>

      {/* ============================================================ */}
      {/*  Create User Modal                                           */}
      {/* ============================================================ */}
      <Modal
        title="Add User" open={modalOpen}
        onOk={handleCreate}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        confirmLoading={submitting}
        okText={t('common.create')} cancelText={t('common.cancel')}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="username" label={t('auth.username')} rules={[{ required: true, message: 'Username is required' }]}>
            <Input placeholder="username" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Invalid email' }]}>
            <Input placeholder="user@example.com" />
          </Form.Item>
          <Form.Item name="password" label={t('auth.password')} rules={[{ required: true, min: 8, message: 'Password must be at least 8 characters' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="Role" initialValue="viewer" rules={[{ required: true }]}>
            <Select options={roleOptions} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ============================================================ */}
      {/*  Edit User Modal                                             */}
      {/* ============================================================ */}
      <Modal
        title="Edit User" open={editModalOpen}
        onOk={handleEdit}
        onCancel={() => { setEditModalOpen(false); editForm.resetFields(); }}
        confirmLoading={submitting}
        okText={t('common.update')} cancelText={t('common.cancel')}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="username" label={t('auth.username')}>
            <Input disabled />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select options={roleOptions} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ============================================================ */}
      {/*  Reset Password Modal                                        */}
      {/* ============================================================ */}
      <Modal
        title="Reset Password" open={passwordModalOpen}
        onOk={handleResetPassword}
        onCancel={() => { setPasswordModalOpen(false); pwForm.resetFields(); }}
        confirmLoading={submitting}
        okText={t('common.confirm')} cancelText={t('common.cancel')}
        destroyOnHidden
      >
        <Form form={pwForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="password" label={t('auth.new_password')} rules={[{ required: true, min: 8 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="confirm" label={t('auth.confirm_password')} dependencies={['password']} rules={[
            { required: true },
            ({ getFieldValue }) => ({
              validator(_, value) {
                return !value || getFieldValue('password') === value
                  ? Promise.resolve()
                  : Promise.reject(new Error('Passwords do not match'));
              },
            }),
          ]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>

      {/* ============================================================ */}
      {/*  Role Editor Modal                                           */}
      {/* ============================================================ */}
      <Modal
        title={editingRole ? `Edit Role: ${editingRole.name}` : 'Create Role'}
        open={roleModalOpen}
        onOk={handleSaveRole}
        onCancel={() => { setRoleModalOpen(false); roleForm.resetFields(); setCheckedPerms([]); }}
        confirmLoading={submitting}
        okText={editingRole ? t('common.update') : t('common.create')}
        cancelText={t('common.cancel')}
        width={560}
        destroyOnHidden
      >
        <Form form={roleForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Role Name" rules={[{ required: true, min: 2, message: 'Role name is required' }]}>
            <Input placeholder="e.g. editor, developer" disabled={editingRole?.is_system} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input placeholder="Brief description of this role" />
          </Form.Item>
        </Form>

        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: p.text }}>
            <CheckCircleOutlined style={{ marginRight: 6, color: p.accent }} />
            Permissions ({checkedPerms.length}/{allLeafKeys.length})
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={{ ...btnOutline, fontSize: 11, padding: '2px 10px' }}
              onClick={() => setCheckedPerms([...allLeafKeys])}
            >
              Select All
            </button>
            <button
              style={{ ...btnOutline, fontSize: 11, padding: '2px 10px' }}
              onClick={() => setCheckedPerms([])}
            >
              Clear
            </button>
          </div>
        </div>

        <div style={{
          maxHeight: 380, overflow: 'auto', padding: '8px 4px',
          border: `1px solid ${p.cardBorder}`, borderRadius: 8,
          background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
        }}>
          <Tree
            checkable
            selectable={false}
            defaultExpandAll
            checkedKeys={checkedPerms}
            onCheck={handleTreeCheck}
            treeData={treeData}
            style={{ background: 'transparent' }}
          />
        </div>
      </Modal>
    </div>
  );
}

