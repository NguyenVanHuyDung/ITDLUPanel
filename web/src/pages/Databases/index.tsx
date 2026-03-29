import React, { useState, useEffect, useCallback } from 'react';
import { Table, Modal, Form, Input, Select, message, Popconfirm, Tooltip, Spin, Popover, InputNumber } from 'antd';
import {
  PlusOutlined, DeleteOutlined, KeyOutlined, CloudDownloadOutlined,
  ReloadOutlined, DatabaseOutlined, CopyOutlined, LinkOutlined,
  EyeOutlined, EyeInvisibleOutlined, SearchOutlined, ImportOutlined,
  SafetyCertificateOutlined, GlobalOutlined, CloudUploadOutlined,
  UndoOutlined, DownloadOutlined, CloudOutlined, LaptopOutlined,
  TeamOutlined, AimOutlined, CheckOutlined, LoadingOutlined,
  PlayCircleOutlined, PauseCircleOutlined, SyncOutlined,
  PoweroffOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '@/services/api';
import type { Database } from '@/types';
import RequireSoftware from '@/components/RequireSoftware';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePalette } from '@/hooks/usePalette';

interface BackupRecord {
  id: number;
  type: string;
  name: string;
  target_id: number | null;
  target_name: string | null;
  file_path: string;
  file_size: number;
  storage: string;
  status: string;
  created_at: string;
}

interface ApiResponse<T> {
  code: number;
  data: T;
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  return (bytes / 1024 ** 3).toFixed(1) + ' GB';
};

const generatePassword = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

function DatabasesContent() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();
  const [loading, setLoading] = useState(true);
  const [databases, setDatabases] = useState<Database[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedDb, setSelectedDb] = useState<Database | null>(null);
  const [form] = Form.useForm();
  const [pwForm] = Form.useForm();
  const [pmaInstalled, setPmaInstalled] = useState<boolean | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<number>>(new Set());
  const [searchText, setSearchText] = useState('');
  const [dbVersion, setDbVersion] = useState('');
  const [backupCounts, setBackupCounts] = useState<Record<number, number>>({});
  const [backupDb, setBackupDb] = useState<Database | null>(null);
  const [backupList, setBackupList] = useState<BackupRecord[]>([]);
  const [backupListLoading, setBackupListLoading] = useState(false);
  const [backupCreating, setBackupCreating] = useState(false);
  const [backupActionId, setBackupActionId] = useState<number | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchAction, setBatchAction] = useState<'backup' | 'delete' | null>(null);
  const [importingDbId, setImportingDbId] = useState<number | null>(null);
  const [accessChangingId, setAccessChangingId] = useState<number | null>(null);
  const [customIpDb, setCustomIpDb] = useState<Database | null>(null);
  const [customIpValue, setCustomIpValue] = useState('');
  const [quotaDb, setQuotaDb] = useState<Database | null>(null);
  const [quotaInput, setQuotaInput] = useState(0);
  const [quotaUnit, setQuotaUnit] = useState<'MB' | 'GB'>('MB');
  const [quotaSaving, setQuotaSaving] = useState(false);
  const [serviceActionLoading, setServiceActionLoading] = useState<string | null>(null);

  const handleServiceAction = async (action: string) => {
    setServiceActionLoading(action);
    try {
      await api.post('/databases/service', { action });
      message.success(`${action} successful`);
      if (action === 'stop') {
        setDbVersion('');
      } else {
        setTimeout(fetchDbVersion, 1500);
      }
    } catch {
      message.error(`Failed to ${action} database service`);
    } finally {
      setServiceActionLoading(null);
    }
  };

  const togglePasswordVisibility = (id: number) => {
    setVisiblePasswords(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        message.success(`${label} copied`);
      }).catch(() => {
        fallbackCopy(text, label);
      });
    } else {
      fallbackCopy(text, label);
    }
  };

  const fallbackCopy = (text: string, label: string) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      message.success(`${label} copied`);
    } catch {
      message.error(`Failed to copy ${label}`);
    }
    document.body.removeChild(ta);
  };

  const checkPma = useCallback(async () => {
    try {
      const { data: resp } = await api.get('/software');
      const sw = resp.data || {};
      const available = sw.available || [];
      const pma = available.find((s: { name: string; installed: boolean }) => s.name === 'phpmyadmin');
      setPmaInstalled(pma?.installed ?? false);
    } catch {
      setPmaInstalled(false);
    }
  }, []);

  const fetchDbVersion = useCallback(async () => {
    try {
      const { data: resp } = await api.get('/databases/version');
      if (resp.data?.version) setDbVersion(resp.data.version);
    } catch { /* ignore */ }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: resp } = await api.get('/databases');
      setDatabases(resp.data || []);
    } catch {
      message.error('Failed to load databases');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBackupCounts = useCallback(async () => {
    try {
      const { data: resp } = await api.get<ApiResponse<Record<string, number>>>('/backups/database-counts');
      const raw = resp.data ?? {};
      const parsed: Record<number, number> = {};
      for (const [k, v] of Object.entries(raw)) parsed[Number(k)] = v;
      setBackupCounts(parsed);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchData(); checkPma(); fetchBackupCounts(); fetchDbVersion(); }, [fetchData, checkPma, fetchBackupCounts, fetchDbVersion]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      await api.post('/databases', values);
      message.success(t('common.success'));
      setModalOpen(false);
      form.resetFields();
      fetchData();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { message?: string } } };
        message.error(axiosErr.response?.data?.message || 'Failed to create database');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/databases/${id}`);
      message.success(t('common.success'));
      fetchData();
    } catch {
      message.error('Failed to delete database');
    }
  };

  const fetchDbBackups = useCallback(async (dbId: number) => {
    setBackupListLoading(true);
    try {
      const { data: resp } = await api.get('/backups', {
        params: { type: 'database', target_id: dbId, page_size: 100 },
      });
      const list = resp.data?.backups ?? resp.data ?? [];
      setBackupList(Array.isArray(list) ? list : []);
    } catch { setBackupList([]); }
    finally { setBackupListLoading(false); }
  }, []);

  const openBackupModal = (db: Database) => {
    setBackupDb(db);
    fetchDbBackups(db.id);
  };

  const handleCreateBackup = async () => {
    if (!backupDb) return;
    setBackupCreating(true);
    try {
      await api.post('/backups', { type: 'database', target_id: backupDb.id });
      message.success(`Backup created for ${backupDb.name}`);
      fetchBackupCounts();
      fetchDbBackups(backupDb.id);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail || 'Backup failed');
    } finally {
      setBackupCreating(false);
    }
  };

  const handleBackupDelete = async (backupId: number) => {
    setBackupActionId(backupId);
    try {
      await api.delete(`/backups/${backupId}`);
      message.success('Backup deleted');
      if (backupDb) fetchDbBackups(backupDb.id);
      fetchBackupCounts();
    } catch { message.error('Delete failed'); }
    finally { setBackupActionId(null); }
  };

  const handleBackupRestore = async (backupId: number) => {
    setBackupActionId(backupId);
    try {
      await api.post(`/backups/${backupId}/restore`);
      message.success('Backup restored successfully');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail || 'Restore failed');
    } finally { setBackupActionId(null); }
  };

  const handleBackupDownload = async (backup: BackupRecord) => {
    const fileName = backup.file_path.split('/').pop() || backup.name;
    const hide = message.loading(`Downloading ${fileName}…`, 0);
    try {
      const res = await api.get(`/backups/${backup.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch { message.error('Download failed'); }
    finally { hide(); }
  };

  const handleBackup = async (id: number) => {
    try {
      await api.post(`/databases/${id}/backup`);
      message.success('Backup started');
    } catch {
      message.error('Backup failed');
    }
  };

  const handleBatchBackup = async () => {
    if (selectedRowKeys.length === 0) return;
    setBatchAction('backup');
    const hide = message.loading(`Backing up ${selectedRowKeys.length} database(s)…`, 0);
    let ok = 0, fail = 0;
    for (const key of selectedRowKeys) {
      try {
        await api.post('/backups', { type: 'database', target_id: Number(key) });
        ok++;
      } catch { fail++; }
    }
    hide();
    if (ok > 0) message.success(`${ok} backup(s) created`);
    if (fail > 0) message.error(`${fail} backup(s) failed`);
    setSelectedRowKeys([]);
    setBatchAction(null);
    fetchBackupCounts();
  };

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    setBatchAction('delete');
    const hide = message.loading(`Deleting ${selectedRowKeys.length} database(s)…`, 0);
    let ok = 0, fail = 0;
    for (const key of selectedRowKeys) {
      try {
        await api.delete(`/databases/${Number(key)}`);
        ok++;
      } catch { fail++; }
    }
    hide();
    if (ok > 0) message.success(`${ok} database(s) deleted`);
    if (fail > 0) message.error(`${fail} deletion(s) failed`);
    setSelectedRowKeys([]);
    setBatchAction(null);
    fetchData();
    fetchBackupCounts();
  };

  const handleImportSQL = (dbId: number) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.sql,.sql.gz,.gz';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const name = file.name.toLowerCase();
      if (!name.endsWith('.sql') && !name.endsWith('.sql.gz')) {
        message.error('Only .sql and .sql.gz files are supported');
        return;
      }
      setImportingDbId(dbId);
      const hide = message.loading(`Importing ${file.name}…`, 0);
      try {
        const formData = new FormData();
        formData.append('file', file);
        await api.post(`/databases/${dbId}/import`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000,
        });
        message.success('SQL file imported successfully');
        fetchData();
      } catch (err: unknown) {
        const detail = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        message.error(detail || 'Import failed');
      } finally {
        hide();
        setImportingDbId(null);
      }
    };
    input.click();
  };

  const handleChangeAccess = async (db: Database, host: string) => {
    if (host === 'custom') {
      setCustomIpDb(db);
      setCustomIpValue('');
      return;
    }
    setAccessChangingId(db.id);
    try {
      await api.put(`/databases/${db.id}/access`, { host });
      message.success(`Access updated to ${host === '%' ? 'Everyone' : host === 'localhost' ? 'Local Server' : host}`);
      fetchData();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail || 'Failed to update access');
    } finally {
      setAccessChangingId(null);
    }
  };

  const handleCustomIpSubmit = async () => {
    if (!customIpDb || !customIpValue.trim()) return;
    setAccessChangingId(customIpDb.id);
    try {
      await api.put(`/databases/${customIpDb.id}/access`, { host: customIpValue.trim() });
      message.success(`Access updated to ${customIpValue.trim()}`);
      setCustomIpDb(null);
      setCustomIpValue('');
      fetchData();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail || 'Failed to update access');
    } finally {
      setAccessChangingId(null);
    }
  };

  const openQuotaPopover = (db: Database) => {
    setQuotaDb(db);
    const q = db.disk_quota || 0;
    if (q >= 1024 ** 3 && q % (1024 ** 3) === 0) {
      setQuotaUnit('GB');
      setQuotaInput(q / (1024 ** 3));
    } else {
      setQuotaUnit('MB');
      setQuotaInput(Math.round(q / (1024 ** 2)));
    }
  };

  const handleSaveQuota = async () => {
    if (!quotaDb) return;
    setQuotaSaving(true);
    const bytes = quotaInput * (quotaUnit === 'GB' ? 1024 ** 3 : 1024 ** 2);
    try {
      await api.put(`/databases/${quotaDb.id}/quota`, { disk_quota: Math.round(bytes) });
      message.success('Quota updated');
      setQuotaDb(null);
      fetchData();
    } catch {
      message.error('Failed to update quota');
    } finally {
      setQuotaSaving(false);
    }
  };

  const handleChangePassword = async () => {
    try {
      const values = await pwForm.validateFields();
      setSubmitting(true);
      await api.put(`/databases/${selectedDb?.id}/password`, { password: values.password });
      message.success('Password changed');
      setPasswordModalOpen(false);
      pwForm.resetFields();
      fetchData();
    } catch {
      message.error('Failed to change password');
    } finally {
      setSubmitting(false);
    }
  };

  const openPma = () => {
    const host = window.location.hostname;
    window.open(`http://${host}:888/`, '_blank');
  };

  const filteredDatabases = searchText
    ? databases.filter(d =>
        d.name.toLowerCase().includes(searchText.toLowerCase()) ||
        d.username.toLowerCase().includes(searchText.toLowerCase())
      )
    : databases;

  const columns = [
    {
      title: t('databases.db_name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, r: Database) => (
        <div>
          <span style={{ fontWeight: 500, color: p.text }}>
            <DatabaseOutlined style={{ marginRight: 6, color: p.accent }} />{name}
          </span>
          {dbVersion && (
            <div style={{
              fontSize: 10, color: p.textMuted, marginTop: 2, marginLeft: 20,
            }}>
              {dbVersion}
            </div>
          )}
        </div>
      ),
    },
    {
      title: t('databases.db_user'),
      dataIndex: 'username',
      key: 'username',
      render: (username: string) => (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            fontSize: 12, padding: '1px 7px', borderRadius: 4,
            background: `${p.accent}15`, color: p.accent, fontWeight: 500,
          }}>{username}</span>
          <Tooltip title="Copy">
            <CopyOutlined style={{ cursor: 'pointer', color: p.textMuted, fontSize: 11 }} onClick={() => copyToClipboard(username, 'Username')} />
          </Tooltip>
        </div>
      ),
    },
    {
      title: 'Password',
      key: 'password',
      render: (_: unknown, r: Database) => {
        const visible = visiblePasswords.has(r.id);
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <span style={{
              
              fontSize: 12,
              color: visible ? p.text : p.textMuted,
              letterSpacing: visible ? 0 : 2,
              minWidth: isMobile ? 50 : 80,
              display: 'inline-block',
            }}>
              {visible ? (r.password || '—') : '••••••••'}
            </span>
            <Tooltip title={visible ? 'Hide' : 'Show'}>
              <button
                onClick={() => togglePasswordVisibility(r.id)}
                style={{
                  padding: '2px 4px', border: 'none', background: 'transparent',
                  cursor: 'pointer', color: p.textMuted, fontSize: 12, display: 'inline-flex', alignItems: 'center',
                }}
              >
                {visible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
              </button>
            </Tooltip>
            {r.password && (
              <Tooltip title="Copy">
                <CopyOutlined
                  style={{ cursor: 'pointer', color: p.textMuted, fontSize: 11 }}
                  onClick={() => copyToClipboard(r.password!, 'Password')}
                />
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: t('common.size') + ' / Quota',
      key: 'size',
      width: 120,
      render: (_: unknown, r: Database) => {
        const q = r.disk_quota || 0;
        const pct = q > 0 ? Math.min(100, (r.size / q) * 100) : 0;
        const overQuota = q > 0 && r.size > q;
        return (
          <Tooltip title="Click to set quota">
            <button
              onClick={() => openQuotaPopover(r)}
              style={{
                padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
                background: overQuota ? `${p.red}08` : 'transparent',
                cursor: 'pointer', fontSize: 11, color: p.text,
                display: 'flex', flexDirection: 'column', gap: 2,
                textAlign: 'left', transition: 'all 0.15s',
              }}
            >
              <span style={{ fontWeight: 500 }}>
                {formatSize(r.size)}
                {q > 0 && <span style={{ color: p.textMuted, fontWeight: 400 }}> / {formatSize(q)}</span>}
              </span>
              {q > 0 && (
                <div style={{
                  height: 3, width: '100%', borderRadius: 2,
                  background: p.cardBorder, overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    width: `${pct}%`,
                    background: pct > 90 ? (p.red || '#ef4444') : pct > 70 ? (p.amber || '#f59e0b') : (p.green || '#22c55e'),
                  }} />
                </div>
              )}
            </button>
          </Tooltip>
        );
      },
    },
    {
      title: 'Backup',
      key: 'backup',
      width: 130,
      render: (_: unknown, r: Database) => {
        const count = backupCounts[r.id] || 0;
        const isImporting = importingDbId === r.id;
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Tooltip title={`${count} backup(s) — click to manage`}>
              <button
                onClick={() => openBackupModal(r)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 6,
                  border: `1px solid ${count > 0 ? `${p.green}40` : p.cardBorder}`,
                  background: count > 0 ? `${p.green}08` : 'transparent',
                  color: count > 0 ? p.green : p.textMuted,
                  fontSize: 11, fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <CloudUploadOutlined style={{ fontSize: 13 }} />
                {count > 0 ? count : '—'}
              </button>
            </Tooltip>
            <Tooltip title="Import SQL file">
              <button
                onClick={() => handleImportSQL(r.id)}
                disabled={isImporting}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px', borderRadius: 6,
                  border: `1px solid ${p.cardBorder}`,
                  background: 'transparent',
                  color: isImporting ? p.accent : p.textMuted,
                  fontSize: 11, fontWeight: 500,
                  cursor: isImporting ? 'wait' : 'pointer',
                  opacity: isImporting ? 0.6 : 1,
                  transition: 'all 0.15s',
                }}
              >
                {isImporting ? <Spin size="small" /> : <ImportOutlined style={{ fontSize: 12 }} />}
              </button>
            </Tooltip>
          </div>
        );
      },
    },
    {
      title: 'Permission',
      key: 'location',
      width: 140,
      render: (_: unknown, r: Database) => {
        const host = r.remote_access || 'localhost';
        const isChanging = accessChangingId === r.id;
        const label = host === '%' ? 'Everyone' : host === 'localhost' ? 'Local Server' : host;
        const icon = host === '%' ? <TeamOutlined /> : host === 'localhost' ? <LaptopOutlined /> : <AimOutlined />;
        const color = host === '%' ? p.amber : host === 'localhost' ? p.green : p.accent;

        const options = [
          { key: 'localhost', label: 'Local Server', desc: 'Only localhost', icon: <LaptopOutlined />, color: p.green },
          { key: '%', label: 'Everyone', desc: 'Allow all remote', icon: <TeamOutlined />, color: p.amber },
          { key: 'custom', label: 'Specific IP', desc: 'Enter IP address', icon: <AimOutlined />, color: p.accent },
        ];

        const content = (
          <div style={{ minWidth: 180 }}>
            {options.map(opt => {
              const isActive = opt.key === host || (opt.key === 'custom' && host !== 'localhost' && host !== '%');
              return (
                <button
                  key={opt.key}
                  onClick={() => handleChangeAccess(r, opt.key)}
                  disabled={isChanging}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', border: 'none', borderRadius: 6,
                    background: isActive ? `${opt.color}12` : 'transparent',
                    color: isActive ? opt.color : p.text,
                    cursor: isChanging ? 'wait' : 'pointer',
                    fontSize: 12, textAlign: 'left',
                    transition: 'all 0.15s',
                    marginBottom: 2,
                  }}
                >
                  <span style={{ fontSize: 14, width: 20, textAlign: 'center' }}>{opt.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{opt.label}</div>
                    <div style={{ fontSize: 10, color: p.textMuted, marginTop: 1 }}>{opt.desc}</div>
                  </div>
                  {isActive && <CheckOutlined style={{ fontSize: 11, color: opt.color }} />}
                </button>
              );
            })}
          </div>
        );

        return (
          <Popover content={content} trigger="click" placement="bottomLeft" arrow={false}>
            <button style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 6,
              border: `1px solid ${color}40`,
              background: `${color}08`,
              color,
              fontSize: 11, fontWeight: 500,
              cursor: isChanging ? 'wait' : 'pointer',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}>
              {isChanging ? <LoadingOutlined style={{ fontSize: 11 }} /> : <span style={{ fontSize: 12 }}>{icon}</span>}
              {label}
            </button>
          </Popover>
        );
      },
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: isMobile ? 120 : 240,
      render: (_: unknown, r: Database) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {pmaInstalled && (
            <button onClick={openPma} style={{
              padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
              background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              {isMobile ? 'PMA' : 'phpMyAdmin'}
            </button>
          )}
          <button onClick={() => { setSelectedDb(r); setPasswordModalOpen(true); }} style={{
            padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
            transition: 'all 0.15s',
          }}>
            {isMobile ? 'Pwd' : 'Password'}
          </button>
          <Popconfirm
            title={t('common.confirm_delete')}
            onConfirm={() => handleDelete(r.id)}
            okText={t('common.yes')} cancelText={t('common.no')}
            okButtonProps={{ danger: true }}
          >
            <button style={{
              padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.red}`,
              background: 'transparent', color: p.red, fontSize: 11, cursor: 'pointer',
            }}>
              Delete
            </button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{
        background: p.card, borderRadius: 12,
        border: `1px solid ${p.cardBorder}`,
        boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        {/* Header bar */}
        <div style={{
          padding: '14px 20px',
          borderBottom: `1px solid ${p.cardBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: p.headerBg,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>Databases</span>
            <span style={{
              fontSize: 11, padding: '2px 9px', borderRadius: 4,
              background: `${p.accent}15`, color: p.accent, fontWeight: 500,
            }}>
              {databases.length} databases
            </span>
            {dbVersion && (
              <Popover
                trigger="hover"
                placement="bottom"
                arrow={false}
                overlayInnerStyle={{ padding: 0, background: p.card, border: `1px solid ${p.cardBorder}`, borderRadius: 8 }}
                content={
                  <div style={{ display: 'flex', gap: 4, padding: '6px 8px' }}>
                    {([
                      { action: 'restart', icon: <SyncOutlined />, label: 'Restart', color: p.amber },
                      { action: 'reload', icon: <ReloadOutlined />, label: 'Reload', color: p.accent },
                      { action: 'stop', icon: <PoweroffOutlined />, label: 'Stop', color: p.red },
                    ] as const).map(({ action, icon, label, color }) => (
                      <button
                        key={action}
                        disabled={!!serviceActionLoading}
                        onClick={() => handleServiceAction(action)}
                        style={{
                          padding: '4px 12px', borderRadius: 6, border: `1px solid ${color}30`,
                          background: `${color}12`, color, fontSize: 11, fontWeight: 500,
                          cursor: serviceActionLoading ? 'wait' : 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          opacity: serviceActionLoading && serviceActionLoading !== action ? 0.5 : 1,
                          transition: 'all 0.15s',
                        }}
                      >
                        {serviceActionLoading === action ? <LoadingOutlined spin /> : icon} {label}
                      </button>
                    ))}
                  </div>
                }
              >
                <span style={{
                  fontSize: 11, padding: '2px 9px', borderRadius: 4,
                  background: `${p.green}15`, color: p.green, fontWeight: 500,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  {dbVersion}
                </span>
              </Popover>
            )}
          </div>
          <button
            onClick={() => { form.setFieldsValue({ password: generatePassword() }); setModalOpen(true); }}
            style={{
              padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
              display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'opacity 0.15s',
            }}
          >
            <PlusOutlined /> {!isMobile && t('databases.add_database')}
          </button>
        </div>

        {/* Tab bar */}
        <div style={{
          padding: '8px 20px',
          borderBottom: `1px solid ${p.cardBorder}`,
          display: 'flex', gap: 4,
        }}>
          <button style={{
            padding: '6px 16px', borderRadius: 6,
            border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 500,
            background: `${p.accent}15`, color: p.accent,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <DatabaseOutlined /> {dbVersion ? (dbVersion.startsWith('MariaDB') ? 'MariaDB' : 'MySQL') : 'MySQL'}
          </button>
          <button disabled style={{
            padding: '6px 16px', borderRadius: 6,
            border: 'none', cursor: 'not-allowed',
            fontSize: 12, fontWeight: 500, opacity: 0.45,
            background: 'transparent', color: p.textMuted,
          }}>
            PostgreSQL
          </button>
          <button disabled style={{
            padding: '6px 16px', borderRadius: 6,
            border: 'none', cursor: 'not-allowed',
            fontSize: 12, fontWeight: 500, opacity: 0.45,
            background: 'transparent', color: p.textMuted,
          }}>
            Redis
          </button>
        </div>

        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
          padding: '10px 20px',
          borderBottom: `1px solid ${p.cardBorder}`,
        }}>
          <button onClick={() => message.info('Root password management coming soon')} style={{
            padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
          }}>
            <SafetyCertificateOutlined /> {!isMobile && 'Root password'}
          </button>
          {pmaInstalled ? (
            <button onClick={openPma} style={{
              padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
              background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
            }}>
              <LinkOutlined /> {!isMobile && 'phpMyAdmin'}
            </button>
          ) : (
            <Tooltip title="Install phpMyAdmin from App Store">
              <button disabled style={{
                padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
                background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'not-allowed',
                display: 'inline-flex', alignItems: 'center', gap: 6, opacity: 0.5,
              }}>
                <LinkOutlined /> {!isMobile && 'phpMyAdmin'}
              </button>
            </Tooltip>
          )}
          <button onClick={() => message.info('Backup all coming soon')} style={{
            padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
          }}>
            <CloudDownloadOutlined /> {!isMobile && 'Backup All'}
          </button>
          <button onClick={() => message.info('Import coming soon')} style={{
            padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
          }}>
            <ImportOutlined /> {!isMobile && 'Import'}
          </button>

          <div style={{ flex: 1 }} />

          <Input
            placeholder="Database search"
            prefix={<SearchOutlined style={{ color: p.textMuted }} />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            allowClear
            style={{ width: isMobile ? 140 : 200 }}
            size="middle"
          />
          <Tooltip title="Refresh">
            <button onClick={fetchData} style={{
              padding: '5px 10px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
              background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', transition: 'all 0.15s',
            }}>
              <ReloadOutlined />
            </button>
          </Tooltip>
        </div>

        {/* Batch action bar */}
        {selectedRowKeys.length > 0 && (
          <div style={{
            padding: '8px 20px',
            borderBottom: `1px solid ${p.cardBorder}`,
            background: `${p.accent}08`,
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: p.accent }}>
              {selectedRowKeys.length} selected
            </span>
            <Popconfirm
              title={`Backup ${selectedRowKeys.length} database(s)?`}
              description="This will create a backup for each selected database."
              onConfirm={handleBatchBackup}
              okText="Backup All"
            >
              <button
                disabled={batchAction !== null}
                style={{
                  padding: '4px 12px', borderRadius: 6, border: `1px solid ${p.green}60`,
                  background: `${p.green}12`, color: p.green,
                  fontSize: 11, fontWeight: 600, cursor: batchAction ? 'wait' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  opacity: batchAction ? 0.6 : 1,
                  transition: 'all 0.15s',
                }}
              >
                <CloudUploadOutlined style={{ fontSize: 12 }} />
                Backup Selected
              </button>
            </Popconfirm>
            <Popconfirm
              title={`Delete ${selectedRowKeys.length} database(s)?`}
              description="This action cannot be undone. All selected databases and their users will be permanently removed."
              onConfirm={handleBatchDelete}
              okText="Delete All"
              okButtonProps={{ danger: true }}
            >
              <button
                disabled={batchAction !== null}
                style={{
                  padding: '4px 12px', borderRadius: 6, border: `1px solid ${p.red}60`,
                  background: `${p.red}12`, color: p.red,
                  fontSize: 11, fontWeight: 600, cursor: batchAction ? 'wait' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  opacity: batchAction ? 0.6 : 1,
                  transition: 'all 0.15s',
                }}
              >
                <DeleteOutlined style={{ fontSize: 12 }} />
                Delete Selected
              </button>
            </Popconfirm>
            <button
              onClick={() => setSelectedRowKeys([])}
              style={{
                padding: '4px 12px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
                background: 'transparent', color: p.textMuted,
                fontSize: 11, fontWeight: 500, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              Clear
            </button>
          </div>
        )}

        {/* Table */}
        <div style={{ padding: 0 }}>
          <Table
            columns={columns}
            dataSource={filteredDatabases}
            rowKey="id"
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys),
            }}
            loading={{ spinning: loading, indicator: <Spin /> }}
            size="middle"
            scroll={{ x: 800 }}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              size: 'small',
              showTotal: (total) => <span style={{ color: p.textMuted, fontSize: 13 }}>Total {total}</span>,
              style: { padding: '8px 16px', margin: 0 },
            }}
            style={{ fontSize: 13 }}
            rowClassName={() => 'db-table-row'}
          />
        </div>
      </div>

      {/* Add Database Modal */}
      <Modal
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DatabaseOutlined style={{ color: p.accent }} />
            {t('databases.add_database')}
          </span>
        }
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        confirmLoading={submitting}
        okText={t('common.create')}
        cancelText={t('common.cancel')}
        destroyOnHidden
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="db_type" label={t('databases.db_type') || 'Database Type'} initialValue="mysql" rules={[{ required: true }]}>
            <Select options={[
              { value: 'mysql', label: 'MySQL' },
              { value: 'mariadb', label: 'MariaDB' },
            ]} />
          </Form.Item>
          <Form.Item
            name="name"
            label={t('databases.db_name')}
            rules={[
              { required: true, message: 'Database name is required' },
              { pattern: /^[a-zA-Z0-9_]+$/, message: 'Only letters, numbers and underscores' },
              { max: 64, message: 'Maximum 64 characters' },
            ]}
          >
            <Input placeholder="my_database" />
          </Form.Item>
          <Form.Item
            name="username"
            label={t('databases.db_user')}
            rules={[
              { required: true, message: 'Username is required' },
              { pattern: /^[a-zA-Z0-9_]+$/, message: 'Only letters, numbers and underscores' },
              { max: 32, message: 'Maximum 32 characters' },
            ]}
          >
            <Input placeholder="db_user" />
          </Form.Item>
          <Form.Item name="password" label={t('auth.password')} rules={[{ required: true }, { min: 6, message: 'Minimum 6 characters' }]}>
            <Input.Password
              addonAfter={
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <Tooltip title="Generate new password">
                    <ReloadOutlined onClick={() => form.setFieldsValue({ password: generatePassword() })} style={{ cursor: 'pointer' }} />
                  </Tooltip>
                  <Tooltip title="Copy password">
                    <CopyOutlined onClick={() => {
                      const pw = form.getFieldValue('password');
                      if (pw) copyToClipboard(pw, 'Password');
                    }} style={{ cursor: 'pointer' }} />
                  </Tooltip>
                </span>
              }
            />
          </Form.Item>
          <Form.Item name="charset" label={t('databases.charset')} initialValue="utf8mb4">
            <Select options={[
              { value: 'utf8mb4', label: 'utf8mb4 (Recommended)' },
              { value: 'utf8', label: 'utf8' },
              { value: 'latin1', label: 'latin1' },
              { value: 'ascii', label: 'ascii' },
            ]} />
          </Form.Item>
          <Form.Item name="remote_access" label="Access Permission" initialValue="localhost">
            <Select options={[
              { value: 'localhost', label: 'Localhost — Local access only' },
              { value: '%', label: 'All — Allow remote connections' },
              { value: 'ip', label: 'Specific IP' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyOutlined style={{ color: p.accent }} />
            Change Password — {selectedDb?.name}
          </span>
        }
        open={passwordModalOpen}
        onOk={handleChangePassword}
        onCancel={() => { setPasswordModalOpen(false); pwForm.resetFields(); }}
        confirmLoading={submitting}
        okText={t('common.update')}
        cancelText={t('common.cancel')}
        destroyOnHidden
      >
        <Form form={pwForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="password" label={t('auth.new_password')} rules={[{ required: true, min: 8 }]}>
            <Input.Password
              addonAfter={
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <Tooltip title="Generate & copy">
                    <ReloadOutlined onClick={() => {
                      const pw = generatePassword();
                      pwForm.setFieldsValue({ password: pw });
                      copyToClipboard(pw, 'Generated password');
                    }} style={{ cursor: 'pointer' }} />
                  </Tooltip>
                  <Tooltip title="Copy">
                    <CopyOutlined onClick={() => {
                      const pw = pwForm.getFieldValue('password');
                      if (pw) copyToClipboard(pw, 'Password');
                    }} style={{ cursor: 'pointer' }} />
                  </Tooltip>
                </span>
              }
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Custom IP Modal */}
      <Modal
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AimOutlined style={{ color: p.accent }} />
            Specific IP — {customIpDb?.name}
          </span>
        }
        open={!!customIpDb}
        onCancel={() => { setCustomIpDb(null); setCustomIpValue(''); }}
        onOk={handleCustomIpSubmit}
        okText="Apply"
        cancelText={t('common.cancel')}
        confirmLoading={accessChangingId !== null}
        destroyOnHidden
        width={400}
      >
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: p.textMuted, marginBottom: 10 }}>
            Enter an IP address or CIDR range to allow remote access from that host only.
          </div>
          <Input
            placeholder="e.g. 192.168.1.100 or 10.0.0.%"
            value={customIpValue}
            onChange={e => setCustomIpValue(e.target.value)}
            onPressEnter={handleCustomIpSubmit}
            autoFocus
          />
          <div style={{ fontSize: 11, color: p.textMuted, marginTop: 8 }}>
            Use <code style={{ background: p.codeBg, padding: '1px 4px', borderRadius: 3 }}>%</code> as wildcard.
            E.g. <code style={{ background: p.codeBg, padding: '1px 4px', borderRadius: 3 }}>192.168.1.%</code> for entire subnet.
          </div>
        </div>
      </Modal>

      {/* Quota Modal */}
      <Modal
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DatabaseOutlined style={{ color: p.accent }} />
            Disk Quota — {quotaDb?.name}
          </span>
        }
        open={!!quotaDb}
        onCancel={() => setQuotaDb(null)}
        onOk={handleSaveQuota}
        okText="Save"
        cancelText="Cancel"
        confirmLoading={quotaSaving}
        destroyOnHidden
        width={420}
      >
        {quotaDb && (
          <div style={{ marginTop: 16 }}>
            {/* Current usage */}
            <div style={{
              padding: 12, borderRadius: 8, marginBottom: 14,
              background: p.codeBg, border: `1px solid ${p.cardBorder}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: p.textMuted }}>Current Size</span>
                <span style={{ fontWeight: 600, color: p.text }}>{formatSize(quotaDb.size)}</span>
              </div>
              {(quotaDb.disk_quota || 0) > 0 && (() => {
                const pct = Math.min(100, (quotaDb.size / quotaDb.disk_quota!) * 100);
                return (
                  <div style={{ marginTop: 6 }}>
                    <div style={{
                      height: 6, borderRadius: 3, background: p.cardBorder, overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', borderRadius: 3,
                        width: `${pct}%`,
                        background: pct > 90 ? (p.red || '#ef4444') : pct > 70 ? (p.amber || '#f59e0b') : (p.green || '#22c55e'),
                      }} />
                    </div>
                    <div style={{ fontSize: 10, color: p.textMuted, marginTop: 3 }}>{pct.toFixed(1)}% of quota used</div>
                  </div>
                );
              })()}
            </div>

            {/* Set quota */}
            <div style={{ fontSize: 12, fontWeight: 600, color: p.text, marginBottom: 8 }}>Set Quota Limit</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <InputNumber
                min={0}
                value={quotaInput}
                onChange={v => setQuotaInput(v || 0)}
                style={{ width: 120 }}
                placeholder="0 = unlimited"
              />
              <Select value={quotaUnit} onChange={setQuotaUnit} style={{ width: 80 }} options={[
                { value: 'MB', label: 'MB' },
                { value: 'GB', label: 'GB' },
              ]} />
            </div>

            {/* Presets */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {[
                { label: 'Unlimited', mb: 0 },
                { label: '256 MB', mb: 256 },
                { label: '512 MB', mb: 512 },
                { label: '1 GB', mb: 1024 },
                { label: '2 GB', mb: 2048 },
                { label: '5 GB', mb: 5120 },
              ].map(preset => {
                const bytes = preset.mb * 1024 * 1024;
                const isActive = (quotaDb.disk_quota || 0) === bytes;
                return (
                  <button
                    key={preset.label}
                    onClick={() => { setQuotaInput(preset.mb >= 1024 ? preset.mb / 1024 : preset.mb); setQuotaUnit(preset.mb >= 1024 ? 'GB' : 'MB'); }}
                    style={{
                      padding: '3px 10px', borderRadius: 5, fontSize: 10, fontWeight: 500,
                      border: `1px solid ${isActive ? `${p.accent}60` : p.cardBorder}`,
                      background: isActive ? `${p.accent}12` : 'transparent',
                      color: isActive ? p.accent : p.textMuted,
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: 11, color: p.textMuted }}>
              Set to <strong>0</strong> for unlimited. Quota is advisory — a warning displays when usage exceeds the limit.
            </div>
          </div>
        )}
      </Modal>

      {/* ======================== Backup Management Modal ======================== */}
      <Modal
        title={null}
        open={!!backupDb}
        onCancel={() => { setBackupDb(null); setBackupList([]); }}
        footer={null}
        width={680}
        destroyOnHidden
        styles={{ body: { padding: 0 } }}
      >
        {backupDb && (
          <div>
            {/* Header */}
            <div style={{
              padding: '20px 24px 16px',
              borderBottom: `1px solid ${p.cardBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: p.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CloudUploadOutlined style={{ color: p.accent }} />
                  Backup — {backupDb.name}
                </div>
                <div style={{ fontSize: 11, color: p.textMuted, marginTop: 2 }}>
                  {backupList.length} backup(s) available
                </div>
              </div>
              <button
                onClick={handleCreateBackup}
                disabled={backupCreating}
                style={{
                  padding: '7px 16px', borderRadius: 7, border: 'none',
                  background: p.accent, color: '#fff',
                  fontSize: 12, fontWeight: 600, cursor: backupCreating ? 'wait' : 'pointer',
                  opacity: backupCreating ? 0.7 : 1,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  transition: 'all 0.15s',
                }}
              >
                {backupCreating ? <Spin size="small" /> : <PlusOutlined />}
                {backupCreating ? 'Creating...' : 'New Backup'}
              </button>
            </div>

            {/* Backup list */}
            <div style={{ padding: '0', maxHeight: 420, overflowY: 'auto' }}>
              {backupListLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                  <Spin />
                </div>
              ) : backupList.length === 0 ? (
                <div style={{
                  padding: '48px 24px', textAlign: 'center', color: p.textMuted,
                }}>
                  <CloudOutlined style={{ fontSize: 36, opacity: 0.3, display: 'block', marginBottom: 12 }} />
                  <div style={{ fontSize: 13 }}>No backups yet</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>Click &quot;New Backup&quot; to create the first backup</div>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}>
                      {['Filename', 'Size', 'Time', 'Actions'].map(h => (
                        <th key={h} style={{
                          padding: '8px 16px', fontSize: 11, fontWeight: 600,
                          color: p.textMuted, textAlign: 'left',
                          borderBottom: `1px solid ${p.cardBorder}`,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {backupList.map(b => {
                      const fileName = b.file_path.split('/').pop() || b.name;
                      const sizeStr = formatSize(b.file_size);
                      const timeStr = b.created_at
                        ? new Date(b.created_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '—';
                      const isActing = backupActionId === b.id;
                      return (
                        <tr key={b.id} style={{ borderBottom: `1px solid ${p.cardBorder}` }}>
                          <td style={{ padding: '10px 16px' }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: p.text, wordBreak: 'break-all' }}>{fileName}</div>
                          </td>
                          <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: 11, color: p.textMuted }}>{sizeStr}</span>
                          </td>
                          <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: 11, color: p.textMuted }}>{timeStr}</span>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <Tooltip title="Restore">
                                <Popconfirm
                                  title="Restore this backup?"
                                  description="This will overwrite the current database."
                                  onConfirm={() => handleBackupRestore(b.id)}
                                  okText="Restore"
                                  okButtonProps={{ danger: true }}
                                >
                                  <button style={{
                                    padding: '4px 8px', border: 'none', borderRadius: 4,
                                    background: 'transparent', cursor: isActing ? 'wait' : 'pointer',
                                    color: p.amber, fontSize: 13, opacity: isActing ? 0.5 : 1,
                                    display: 'inline-flex', alignItems: 'center',
                                  }} disabled={isActing}>
                                    {isActing ? <Spin size="small" /> : <UndoOutlined />}
                                  </button>
                                </Popconfirm>
                              </Tooltip>
                              <Tooltip title="Download">
                                <button
                                  onClick={() => handleBackupDownload(b)}
                                  style={{
                                    padding: '4px 8px', border: 'none', borderRadius: 4,
                                    background: 'transparent', cursor: 'pointer',
                                    color: p.accent, fontSize: 13,
                                    display: 'inline-flex', alignItems: 'center',
                                  }}
                                >
                                  <DownloadOutlined />
                                </button>
                              </Tooltip>
                              <Tooltip title="Delete">
                                <Popconfirm
                                  title="Delete this backup?"
                                  description="This action cannot be undone."
                                  onConfirm={() => handleBackupDelete(b.id)}
                                  okText="Delete"
                                  okButtonProps={{ danger: true }}
                                >
                                  <button style={{
                                    padding: '4px 8px', border: 'none', borderRadius: 4,
                                    background: 'transparent', cursor: isActing ? 'wait' : 'pointer',
                                    color: p.red, fontSize: 13, opacity: isActing ? 0.5 : 1,
                                    display: 'inline-flex', alignItems: 'center',
                                  }} disabled={isActing}>
                                    <DeleteOutlined />
                                  </button>
                                </Popconfirm>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function Databases() {
  const { t } = useTranslation();
  return (
    <RequireSoftware softwareTypes={['database']} label={t('databases.title') || 'Database Server (MySQL/MariaDB)'}>
      <DatabasesContent />
    </RequireSoftware>
  );
}
