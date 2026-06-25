import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Table, Modal, Form, Input, Select, message, Popconfirm, Tooltip, Spin, Popover, InputNumber, Progress, Tag } from 'antd';
import AddDatabaseModal from './AddDatabaseModal';
import {
  PlusOutlined, DeleteOutlined, KeyOutlined, CloudDownloadOutlined,
  ReloadOutlined, DatabaseOutlined, CopyOutlined, LinkOutlined,
  EyeOutlined, EyeInvisibleOutlined, SearchOutlined, ImportOutlined,
  SafetyCertificateOutlined, GlobalOutlined, CloudUploadOutlined,
  UndoOutlined, DownloadOutlined, CloudOutlined, LaptopOutlined,
  TeamOutlined, AimOutlined, CheckOutlined, LoadingOutlined,
  PlayCircleOutlined, PauseCircleOutlined, SyncOutlined,
  PoweroffOutlined, ThunderboltOutlined, ApiOutlined, HddOutlined,
  ClusterOutlined, FundOutlined, SaveOutlined,
  ClockCircleOutlined, RiseOutlined, FallOutlined,
  LineChartOutlined, AppstoreOutlined,
  BranchesOutlined, DashboardOutlined, CodeOutlined, FieldTimeOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '@/services/api';
import type { Database } from '@/types';
import { formatDateTime } from '@/lib/datetime';
import RequireSoftware from '@/components/RequireSoftware';
import PostgresqlManageModal from '@/components/PostgresqlManageModal';
import PgAdminManageModal from '@/components/PgAdminManageModal';
import RedisManageModal from '@/components/RedisManageModal';
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
  strategy: string;
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
  const [pmaConfig, setPmaConfig] = useState<{ ssl_enabled?: boolean; ssl_port?: number; access_port?: number } | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<number>>(new Set());
  const [searchText, setSearchText] = useState('');
  const [dbVersion, setDbVersion] = useState('');
  const [backupCounts, setBackupCounts] = useState<Record<number, number>>({});
  const [backupDb, setBackupDb] = useState<Database | null>(null);
  const [backupList, setBackupList] = useState<BackupRecord[]>([]);
  const [backupListLoading, setBackupListLoading] = useState(false);
  const [backupCreating, setBackupCreating] = useState(false);
  const [backupActionId, setBackupActionId] = useState<number | null>(null);
  const [ftpStorages, setFtpStorages] = useState<{ id: number; name: string; is_default: boolean }[]>([]);
  const [cloudStorages, setCloudStorages] = useState<{ id: number; name: string; type: string; is_default: boolean }[]>([]);
  const [backupStorage, setBackupStorage] = useState<string>('local');
  const [backupStorageId, setBackupStorageId] = useState<number | null>(null);
  const [backupStrategy, setBackupStrategy] = useState<'full' | 'incremental'>('full');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchAction, setBatchAction] = useState<'backup' | 'delete' | null>(null);
  const [importingDbId, setImportingDbId] = useState<number | null>(null);
  const [accessChangingId, setAccessChangingId] = useState<number | null>(null);
  const [customIpDb, setCustomIpDb] = useState<Database | null>(null);
  const [customIpValue, setCustomIpValue] = useState('');
  const [quotaDb, setQuotaDb] = useState<Database | null>(null);
  const [detectedDbType, setDetectedDbType] = useState<string>('');
  const [activeDbTab, setActiveDbTab] = useState<'mysql' | 'postgresql' | 'redis' | 'mongodb'>('mysql');
  const [installedEngines, setInstalledEngines] = useState<Set<string>>(new Set());
  const initialTabSet = useRef(false);
  const [pgDatabases, setPgDatabases] = useState<any[]>([]);
  const [pgLoading, setPgLoading] = useState(false);
  const [redisInfo, setRedisInfo] = useState<any>(null);
  const [redisLoading, setRedisLoading] = useState(false);
  const [redisPersistence, setRedisPersistence] = useState<any>(null);
  const [redisReplication, setRedisReplication] = useState<any>(null);
  const [redisDbOverview, setRedisDbOverview] = useState<any[]>([]);
  const [redisAutoRefresh, setRedisAutoRefresh] = useState(true);
  const [redisFlushLoading, setRedisFlushLoading] = useState<string | null>(null);
  const [redisManageOpen, setRedisManageOpen] = useState(false);
  const [quotaInput, setQuotaInput] = useState(0);
  const [quotaUnit, setQuotaUnit] = useState<'MB' | 'GB'>('MB');
  const [quotaSaving, setQuotaSaving] = useState(false);
  const [serviceActionLoading, setServiceActionLoading] = useState<string | null>(null);
  const [pgManageOpen, setPgManageOpen] = useState(false);
  const [pgSearchText, setPgSearchText] = useState('');
  const [pgSelectedRowKeys, setPgSelectedRowKeys] = useState<React.Key[]>([]);
  const [pgBatchAction, setPgBatchAction] = useState<'backup' | 'delete' | null>(null);
  const [pgaInstalled, setPgaInstalled] = useState<boolean | null>(null);
  const [pgaConfig, setPgaConfig] = useState<{ ssl_enabled?: boolean; ssl_port?: number; access_port?: number } | null>(null);
  const [pgaManageOpen, setPgaManageOpen] = useState(false);

  // MongoDB state
  const [mongoDatabases, setMongoDatabases] = useState<any[]>([]);
  const [mongoLoading, setMongoLoading] = useState(false);
  const [mongoStats, setMongoStats] = useState<any>(null);
  const [mongoUsers, setMongoUsers] = useState<any[]>([]);
  const [mongoSearchText, setMongoSearchText] = useState('');
  const [mongoSelectedDb, setMongoSelectedDb] = useState<string | null>(null);
  const [mongoCollections, setMongoCollections] = useState<any[]>([]);
  const [mongoCollLoading, setMongoCollLoading] = useState(false);
  const [mongoCreateDbOpen, setMongoCreateDbOpen] = useState(false);
  const [mongoCreateCollOpen, setMongoCreateCollOpen] = useState(false);
  const [mongoCreateUserOpen, setMongoCreateUserOpen] = useState(false);
  const [mongoSubmitting, setMongoSubmitting] = useState(false);
  const [mongoDbForm] = Form.useForm();
  const [mongoCollForm] = Form.useForm();
  const [mongoUserForm] = Form.useForm();
  const [mongoSelectedRowKeys, setMongoSelectedRowKeys] = useState<React.Key[]>([]);
  const [mongoView, setMongoView] = useState<'databases' | 'users'>('databases');

  const handleServiceAction = async (action: string) => {
    setServiceActionLoading(action);
    try {
      const payload: { action: string; db_type?: string } = { action };
      if (activeDbTab === 'postgresql') payload.db_type = 'postgresql';
      if (activeDbTab === 'redis') payload.db_type = 'redis';
      if (activeDbTab === 'mongodb') payload.db_type = 'mongodb';
      if (activeDbTab === 'redis') {
        await api.post(`/software/redis/${action}`);
      } else if (activeDbTab === 'mongodb') {
        await api.post(`/software/mongodb/${action}`);
      } else {
        await api.post('/databases/service', payload);
      }
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
      if (pma?.installed) {
        try {
          const { data: cfgResp } = await api.get('/software/phpmyadmin/manager');
          setPmaConfig(cfgResp.data || null);
        } catch { /* ignore */ }
      }
      const pga = available.find((s: { name: string; installed: boolean }) => s.name === 'pgadmin');
      setPgaInstalled(pga?.installed ?? false);
      if (pga?.installed) {
        try {
          const { data: cfgResp } = await api.get('/software/pgadmin/manager');
          setPgaConfig(cfgResp.data || null);
        } catch { /* ignore */ }
      }
      const installed = sw.installed || [];
      const engines = new Set<string>();
      const mysqlSw = installed.find((s: any) => s.type === 'database' && (s.name === 'mysql' || s.name === 'mariadb'));
      const pgSw = installed.find((s: any) => s.name === 'postgresql');
      const redisSw = installed.find((s: any) => s.name === 'redis');
      if (mysqlSw) {
        engines.add('mysql');
        setDetectedDbType(mysqlSw.version?.startsWith('mariadb') ? 'mariadb' : 'mysql');
      }
      if (pgSw) engines.add('postgresql');
      if (redisSw) engines.add('redis');
      const mongoSw = installed.find((s: any) => s.name === 'mongodb');
      if (mongoSw) engines.add('mongodb');
      setInstalledEngines(engines);
      // Auto-select first available tab (only on first load)
      if (!initialTabSet.current) {
        initialTabSet.current = true;
        if (engines.has('mysql')) {
          setActiveDbTab('mysql');
        } else if (engines.has('postgresql')) {
          setActiveDbTab('postgresql');
          setDetectedDbType('postgresql');
        } else if (engines.has('mongodb')) {
          setActiveDbTab('mongodb');
        } else if (engines.has('redis')) {
          setActiveDbTab('redis');
        }
      }
    } catch {
      setPmaInstalled(false);
    }
  }, []);

  const fetchDbVersion = useCallback(async () => {
    try {
      const dbTypeParam = activeDbTab === 'postgresql' ? '?db_type=postgresql' : '';
      const { data: resp } = await api.get(`/databases/version${dbTypeParam}`);
      if (resp.data?.version) setDbVersion(resp.data.version);
    } catch { /* ignore */ }
  }, [activeDbTab]);

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

  const fetchPgDatabases = useCallback(async () => {
    setPgLoading(true);
    try {
      const { data: resp } = await api.get('/software/postgresql/databases');
      setPgDatabases(resp.data || []);
    } catch { /* ignore */ }
    finally { setPgLoading(false); }
  }, []);

  const fetchRedisInfo = useCallback(async () => {
    setRedisLoading(true);
    try {
      const [infoResp, sizeResp, memResp, clientsResp, persistResp, repResp, dbOverviewResp] = await Promise.all([
        api.get('/redis/info').catch(() => null),
        api.get('/redis/dbsize').catch(() => null),
        api.get('/redis/memory').catch(() => null),
        api.get('/redis/clients').catch(() => null),
        api.get('/redis/persistence').catch(() => null),
        api.get('/redis/replication').catch(() => null),
        api.get('/redis/db-overview').catch(() => null),
      ]);
      setRedisInfo({
        info: infoResp?.data?.data || {},
        dbsize: sizeResp?.data?.data?.dbsize ?? 0,
        memory: memResp?.data?.data || {},
        clients: clientsResp?.data?.data || [],
      });
      setRedisPersistence(persistResp?.data?.data || null);
      setRedisReplication(repResp?.data?.data || null);
      setRedisDbOverview(dbOverviewResp?.data?.data || []);
    } catch { /* ignore */ }
    finally { setRedisLoading(false); }
  }, []);

  const fetchMongoDatabases = useCallback(async () => {
    setMongoLoading(true);
    try {
      const [dbResp, statsResp, usersResp] = await Promise.all([
        api.get('/software/mongodb/databases').catch(() => null),
        api.get('/software/mongodb/stats').catch(() => null),
        api.get('/software/mongodb/users').catch(() => null),
      ]);
      setMongoDatabases(dbResp?.data?.data || []);
      setMongoStats(statsResp?.data?.data || null);
      setMongoUsers(usersResp?.data?.data || []);
    } catch { /* ignore */ }
    finally { setMongoLoading(false); }
  }, []);

  const fetchMongoCollections = useCallback(async (dbName: string) => {
    setMongoCollLoading(true);
    try {
      const { data: resp } = await api.get(`/software/mongodb/databases/${dbName}/collections`);
      setMongoCollections(resp.data || []);
    } catch { /* ignore */ }
    finally { setMongoCollLoading(false); }
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

  // Fetch tab-specific data when switching
  useEffect(() => {
    if (activeDbTab === 'postgresql' && installedEngines.has('postgresql')) fetchPgDatabases();
    if (activeDbTab === 'redis' && installedEngines.has('redis')) fetchRedisInfo();
    if (activeDbTab === 'mongodb' && installedEngines.has('mongodb')) fetchMongoDatabases();
    if (activeDbTab === 'mysql') fetchDbVersion();
    if (activeDbTab === 'postgresql') fetchDbVersion();
  }, [activeDbTab, installedEngines, fetchPgDatabases, fetchRedisInfo, fetchMongoDatabases, fetchDbVersion]);

  // Redis auto-refresh every 5s while on the Redis tab
  useEffect(() => {
    if (activeDbTab !== 'redis' || !redisAutoRefresh) return;
    const id = setInterval(() => { fetchRedisInfo(); }, 5000);
    return () => clearInterval(id);
  }, [activeDbTab, redisAutoRefresh, fetchRedisInfo]);

  const handleRedisFlush = async (db: number) => {
    setRedisFlushLoading(`db-${db}`);
    try {
      await api.post('/redis/flush', { db });
      message.success(`DB ${db} flushed`);
      fetchRedisInfo();
    } catch (e: any) {
      message.error(e?.response?.data?.message || 'Failed to flush DB');
    } finally { setRedisFlushLoading(null); }
  };

  const handleRedisFlushAll = async () => {
    setRedisFlushLoading('all');
    try {
      await api.post('/redis/flush', { all: true });
      message.success('All databases flushed');
      fetchRedisInfo();
    } catch (e: any) {
      message.error(e?.response?.data?.message || 'Failed to flush all');
    } finally { setRedisFlushLoading(null); }
  };

  const handleRedisKillClient = async (id: string) => {
    try {
      await api.delete(`/redis/clients/${id}`);
      message.success('Client killed');
      fetchRedisInfo();
    } catch (e: any) {
      message.error(e?.response?.data?.message || 'Failed to kill client');
    }
  };

  const handleRedisBgsave = async () => {
    try {
      await api.post('/redis/bgsave');
      message.success('Background save started');
      setTimeout(fetchRedisInfo, 1500);
    } catch (e: any) {
      message.error(e?.response?.data?.message || 'Failed to start BGSAVE');
    }
  };

  const formatUptime = (seconds: number): string => {
    if (!seconds || seconds < 0) return '—';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const formatBytes = (n: number): string => {
    if (!n || n <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
  };

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
    Promise.allSettled([
      api.get('/ftp-storages'),
      api.get('/cloud-storages'),
    ]).then(([ftpRes, cloudRes]) => {
      const ftpList = ftpRes.status === 'fulfilled' ? (ftpRes.value.data?.data ?? []).filter((s: any) => s.is_active) : [];
      setFtpStorages(ftpList);
      const cloudList = cloudRes.status === 'fulfilled' ? (cloudRes.value.data?.data ?? []) : [];
      setCloudStorages(cloudList);
      const defaultFtp = ftpList.find((s: any) => s.is_default);
      if (defaultFtp) {
        setBackupStorage('ftp');
        setBackupStorageId(defaultFtp.id);
      } else {
        setBackupStorage('local');
        setBackupStorageId(null);
      }
    });
  };

  const handleCreateBackup = async () => {
    if (!backupDb) return;
    setBackupCreating(true);
    try {
      const payload: Record<string, unknown> = { type: 'database', target_id: backupDb.id, strategy: backupStrategy };
      if (backupStorage === 'ftp' && backupStorageId) {
        payload.storage = 'ftp';
        payload.storage_id = backupStorageId;
      } else if (['s3', 'google_drive', 'onedrive'].includes(backupStorage) && backupStorageId) {
        payload.storage = backupStorage;
        payload.storage_id = backupStorageId;
      }
      await api.post('/backups', payload);
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
    const proto = pmaConfig?.ssl_enabled ? 'https' : 'http';
    const port = pmaConfig?.ssl_enabled ? (pmaConfig?.ssl_port || 887) : (pmaConfig?.access_port || 888);
    window.open(`${proto}://${host}:${port}/`, '_blank');
  };

  const openPga = () => {
    const host = window.location.hostname;
    const proto = pgaConfig?.ssl_enabled ? 'https' : 'http';
    const port = pgaConfig?.ssl_enabled ? (pgaConfig?.ssl_port || 5051) : (pgaConfig?.access_port || 5050);
    window.open(`${proto}://${host}:${port}/`, '_blank');
  };

  const filteredDatabases = searchText
    ? databases.filter(d =>
        (d.db_type === 'mysql' || d.db_type === 'mariadb') && (
        d.name.toLowerCase().includes(searchText.toLowerCase()) ||
        d.username.toLowerCase().includes(searchText.toLowerCase()))
      )
    : databases.filter(d => d.db_type === 'mysql' || d.db_type === 'mariadb');

  const filteredPgDatabases = pgSearchText
    ? databases.filter(d =>
        d.db_type === 'postgresql' && (
        d.name.toLowerCase().includes(pgSearchText.toLowerCase()) ||
        d.username.toLowerCase().includes(pgSearchText.toLowerCase()))
      )
    : databases.filter(d => d.db_type === 'postgresql');

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

  const pgColumns = [
    {
      title: t('databases.db_name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <div>
          <span style={{ fontWeight: 500, color: p.text }}>
            <DatabaseOutlined style={{ marginRight: 6, color: '#336791' }} />{name}
          </span>
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
            background: '#33679115', color: '#336791', fontWeight: 500,
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
          {pgaInstalled && (
            <button onClick={openPga} style={{
              padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
              background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              {isMobile ? 'PGA' : 'pgAdmin'}
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

  const handlePgBatchBackup = async () => {
    if (pgSelectedRowKeys.length === 0) return;
    setPgBatchAction('backup');
    const hide = message.loading(`Backing up ${pgSelectedRowKeys.length} database(s)…`, 0);
    let ok = 0, fail = 0;
    for (const key of pgSelectedRowKeys) {
      try {
        await api.post('/backups', { type: 'database', target_id: Number(key) });
        ok++;
      } catch { fail++; }
    }
    hide();
    if (ok > 0) message.success(`${ok} backup(s) created`);
    if (fail > 0) message.error(`${fail} backup(s) failed`);
    setPgSelectedRowKeys([]);
    setPgBatchAction(null);
    fetchBackupCounts();
  };

  const handlePgBatchDelete = async () => {
    if (pgSelectedRowKeys.length === 0) return;
    setPgBatchAction('delete');
    const hide = message.loading(`Deleting ${pgSelectedRowKeys.length} database(s)…`, 0);
    let ok = 0, fail = 0;
    for (const key of pgSelectedRowKeys) {
      try {
        await api.delete(`/databases/${Number(key)}`);
        ok++;
      } catch { fail++; }
    }
    hide();
    if (ok > 0) message.success(`${ok} database(s) deleted`);
    if (fail > 0) message.error(`${fail} deletion(s) failed`);
    setPgSelectedRowKeys([]);
    setPgBatchAction(null);
    fetchData();
    fetchBackupCounts();
  };

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
              {activeDbTab === 'mysql' ? `${filteredDatabases.length} databases` : activeDbTab === 'postgresql' ? `${filteredPgDatabases.length} databases` : activeDbTab === 'mongodb' ? `${mongoDatabases.length} databases` : 'Redis'}
            </span>
            {dbVersion && activeDbTab !== 'redis' && activeDbTab !== 'mongodb' && (
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
          {activeDbTab !== 'redis' && activeDbTab !== 'mongodb' && (
            <button
              onClick={() => { form.setFieldsValue({ password: generatePassword(), db_type: activeDbTab === 'postgresql' ? 'postgresql' : (detectedDbType || 'mysql') }); setModalOpen(true); }}
              style={{
                padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
                display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'opacity 0.15s',
              }}
            >
              <PlusOutlined /> {!isMobile && t('databases.add_database')}
            </button>
          )}
        </div>

        {/* Tab bar */}
        <div style={{
          padding: '8px 20px',
          borderBottom: `1px solid ${p.cardBorder}`,
          display: 'flex', gap: 4,
        }}>
          {([
            { key: 'mysql' as const, label: detectedDbType === 'mariadb' ? 'MariaDB' : 'MySQL', color: '#3E6D8E', engine: 'mysql' },
            { key: 'postgresql' as const, label: 'PostgreSQL', color: '#336791', engine: 'postgresql' },
            { key: 'mongodb' as const, label: 'MongoDB', color: '#47A248', engine: 'mongodb' },
            { key: 'redis' as const, label: 'Redis', color: '#DC382D', engine: 'redis' },
          ] as const).map(tab => {
            const installed = installedEngines.has(tab.engine);
            const active = activeDbTab === tab.key;
            return (
              <button
                key={tab.key}
                disabled={!installed}
                onClick={() => installed && setActiveDbTab(tab.key)}
                style={{
                  padding: '6px 16px', borderRadius: 6,
                  border: active ? `1px solid ${tab.color}40` : '1px solid transparent',
                  cursor: installed ? 'pointer' : 'not-allowed',
                  fontSize: 12, fontWeight: 500,
                  opacity: installed ? 1 : 0.35,
                  background: active ? `${tab.color}15` : 'transparent',
                  color: active ? tab.color : (installed ? p.text : p.textMuted),
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  transition: 'all 0.15s',
                }}
              >
                <DatabaseOutlined /> {tab.label}
                {!installed && <span style={{ fontSize: 10 }}>(not installed)</span>}
              </button>
            );
          })}
        </div>

        {/* Tab content area */}
        <div style={{ minHeight: 200 }}>

        {/* MySQL/MariaDB content */}
        {activeDbTab === 'mysql' && (<>
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
        </>)}

        {/* PostgreSQL content */}
        {activeDbTab === 'postgresql' && (<>
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
          padding: '10px 20px',
          borderBottom: `1px solid ${p.cardBorder}`,
        }}>
          <button onClick={() => setPgManageOpen(true)} style={{
            padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
          }}>
            <DatabaseOutlined /> {!isMobile && 'Manage'}
          </button>
          <button onClick={() => message.info('Root password management coming soon')} style={{
            padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
          }}>
            <SafetyCertificateOutlined /> {!isMobile && 'Root password'}
          </button>
          {pgaInstalled ? (
            <button onClick={openPga} style={{
              padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
              background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
            }}>
              <LinkOutlined /> {!isMobile && 'pgAdmin'}
            </button>
          ) : (
            <Tooltip title="Install pgAdmin from App Store">
              <button disabled style={{
                padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
                background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'not-allowed',
                display: 'inline-flex', alignItems: 'center', gap: 6, opacity: 0.5,
              }}>
                <LinkOutlined /> {!isMobile && 'pgAdmin'}
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
            value={pgSearchText}
            onChange={e => setPgSearchText(e.target.value)}
            allowClear
            style={{ width: isMobile ? 140 : 200 }}
            size="middle"
          />
          <Tooltip title="Refresh">
            <button onClick={() => { fetchData(); fetchPgDatabases(); }} style={{
              padding: '5px 10px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
              background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', transition: 'all 0.15s',
            }}>
              <ReloadOutlined />
            </button>
          </Tooltip>
        </div>

        {/* Batch action bar */}
        {pgSelectedRowKeys.length > 0 && (
          <div style={{
            padding: '8px 20px',
            borderBottom: `1px solid ${p.cardBorder}`,
            background: `#33679108`,
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#336791' }}>
              {pgSelectedRowKeys.length} selected
            </span>
            <Popconfirm
              title={`Backup ${pgSelectedRowKeys.length} database(s)?`}
              description="This will create a backup for each selected database."
              onConfirm={handlePgBatchBackup}
              okText="Backup All"
            >
              <button
                disabled={pgBatchAction !== null}
                style={{
                  padding: '4px 12px', borderRadius: 6, border: `1px solid ${p.green}60`,
                  background: `${p.green}12`, color: p.green,
                  fontSize: 11, fontWeight: 600, cursor: pgBatchAction ? 'wait' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  opacity: pgBatchAction ? 0.6 : 1,
                  transition: 'all 0.15s',
                }}
              >
                <CloudUploadOutlined style={{ fontSize: 12 }} />
                Backup Selected
              </button>
            </Popconfirm>
            <Popconfirm
              title={`Delete ${pgSelectedRowKeys.length} database(s)?`}
              description="This action cannot be undone. All selected databases and their users will be permanently removed."
              onConfirm={handlePgBatchDelete}
              okText="Delete All"
              okButtonProps={{ danger: true }}
            >
              <button
                disabled={pgBatchAction !== null}
                style={{
                  padding: '4px 12px', borderRadius: 6, border: `1px solid ${p.red}60`,
                  background: `${p.red}12`, color: p.red,
                  fontSize: 11, fontWeight: 600, cursor: pgBatchAction ? 'wait' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  opacity: pgBatchAction ? 0.6 : 1,
                  transition: 'all 0.15s',
                }}
              >
                <DeleteOutlined style={{ fontSize: 12 }} />
                Delete Selected
              </button>
            </Popconfirm>
            <button
              onClick={() => setPgSelectedRowKeys([])}
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
            columns={pgColumns}
            dataSource={filteredPgDatabases}
            rowKey="id"
            rowSelection={{
              selectedRowKeys: pgSelectedRowKeys,
              onChange: (keys) => setPgSelectedRowKeys(keys),
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
        </>)}

        {/* Redis content */}
        {activeDbTab === 'redis' && (
          <div style={{ padding: 0 }}>
            {/* Toolbar */}
            <div style={{
              display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
              padding: '10px 20px',
              borderBottom: `1px solid ${p.cardBorder}`,
            }}>
              <button
                onClick={() => setRedisManageOpen(true)}
                style={{
                  padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: '#DC382D', color: '#fff', fontSize: 12, fontWeight: 500,
                  display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                }}
              >
                <AppstoreOutlined /> {t('redis.open_manager')}
              </button>
              <button
                onClick={handleRedisBgsave}
                style={{
                  padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
                  background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                }}
              >
                <SaveOutlined /> {redisPersistence?.rdb_current_save ? t('redis.saving_now') : t('redis.save_now')}
              </button>
              <Popconfirm
                title={t('redis.flush_all_confirm')}
                onConfirm={handleRedisFlushAll}
                okText={t('common.delete')}
                okButtonProps={{ danger: true }}
              >
                <button
                  disabled={redisFlushLoading === 'all'}
                  style={{
                    padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.red}40`,
                    background: 'transparent', color: p.red, fontSize: 12, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                  }}
                >
                  <DeleteOutlined /> {t('redis.flush_all')}
                </button>
              </Popconfirm>
              <div style={{ flex: 1 }} />
              <Tooltip title={t('redis.auto_refresh')}>
                <button
                  onClick={() => setRedisAutoRefresh(v => !v)}
                  style={{
                    padding: '4px 10px', borderRadius: 6,
                    border: `1px solid ${redisAutoRefresh ? '#DC382D40' : p.cardBorder}`,
                    background: redisAutoRefresh ? '#DC382D15' : 'transparent',
                    color: redisAutoRefresh ? '#DC382D' : p.textMuted,
                    fontSize: 11, fontWeight: 500, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    transition: 'all 0.15s',
                  }}
                >
                  <FieldTimeOutlined /> {redisAutoRefresh ? '5s' : 'off'}
                </button>
              </Tooltip>
              <button
                onClick={fetchRedisInfo}
                style={{
                  padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
                  background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5, transition: 'all 0.15s',
                }}
              >
                <ReloadOutlined /> {t('redis.refresh')}
              </button>
            </div>

            {redisLoading && !redisInfo ? (
              <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
            ) : !redisInfo ? (
              <div style={{ textAlign: 'center', padding: 60, color: p.textMuted }}>{t('redis.no_data_available')}</div>
            ) : (
              <>
                {/* Service status banner */}
                <div style={{
                  padding: '14px 20px',
                  background: `linear-gradient(135deg, #DC382D12 0%, #DC382D06 100%)`,
                  borderBottom: `1px solid ${p.cardBorder}`,
                  display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 10,
                    background: '#DC382D20', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <HddOutlined style={{ color: '#DC382D', fontSize: 20 }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                        background: '#4CAF50', boxShadow: '0 0 6px #4CAF5080',
                      }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: p.text }}>
                        {t('redis.service_status')}: <span style={{ color: '#4CAF50' }}>{t('redis.running')}</span>
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: p.textMuted, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span><span style={{ color: p.textMuted }}>v</span>{redisInfo.info?.redis_version || '—'}</span>
                      <span>·</span>
                      <span>{t('redis.uptime')}: {formatUptime(Number(redisInfo.info?.uptime_in_seconds || 0))}</span>
                      <span>·</span>
                      <span>{t('redis.tcp_port')}: {redisInfo.info?.tcp_port || '6379'}</span>
                      <span>·</span>
                      <span>{t('redis.role')}: <Tag color={redisReplication?.role === 'master' ? 'red' : 'orange'} style={{ fontSize: 10, padding: '0 6px', margin: 0 }}>
                        {(redisReplication?.role || 'master').toUpperCase()}
                      </Tag></span>
                    </div>
                  </div>
                </div>

                {/* KPI cards row */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                  gap: 12, padding: '16px 20px',
                  borderBottom: `1px solid ${p.cardBorder}`,
                }}>
                  {(() => {
                    const memUsed = Number(redisInfo.memory?.used_memory || 0);
                    const memMax = Number(redisInfo.memory?.max_memory || 0);
                    const memUsedHuman = redisInfo.memory?.used_memory_human || formatBytes(memUsed);
                    const memPct = memMax > 0 ? Math.min(100, (memUsed / memMax) * 100) : 0;
                    const hits = Number(redisInfo.info?.keyspace_hits || 0);
                    const misses = Number(redisInfo.info?.keyspace_misses || 0);
                    const hitRate = (hits + misses) > 0 ? (hits / (hits + misses)) * 100 : 0;
                    const totalKeys = Number(redisInfo.dbsize || 0);
                    const totalConns = Number(redisInfo.info?.total_connections_received || 0);
                    const totalCmds = Number(redisInfo.info?.total_commands_processed || 0);
                    const ops = Number(redisInfo.info?.instantaneous_ops_per_sec || 0);

                    const cards: { label: string; value: string; sub?: string; color: string; icon: React.ReactNode; progress?: number; progressColor?: string }[] = [
                      {
                        label: t('redis.total_keys'),
                        value: totalKeys.toLocaleString(),
                        sub: `${redisDbOverview.length} ${t('redis.databases').toLowerCase()}`,
                        color: '#DC382D',
                        icon: <KeyOutlined />,
                      },
                      {
                        label: t('redis.used_memory'),
                        value: memUsedHuman,
                        sub: memMax > 0 ? `${memPct.toFixed(1)}% / ${redisInfo.memory?.max_memory_human || formatBytes(memMax)}` : t('redis.unlimited'),
                        color: '#FF9800',
                        icon: <ApiOutlined />,
                        progress: memPct,
                        progressColor: memPct > 90 ? p.red : memPct > 70 ? p.amber : p.green,
                      },
                      {
                        label: t('redis.peak_memory'),
                        value: redisInfo.memory?.used_memory_peak_human || '—',
                        sub: redisInfo.memory?.max_memory_policy ? `policy: ${redisInfo.memory?.max_memory_policy}` : '—',
                        color: '#9C27B0',
                        icon: <LineChartOutlined />,
                      },
                      {
                        label: t('redis.connected_clients'),
                        value: redisInfo.info?.connected_clients ?? redisInfo.clients?.length ?? '0',
                        sub: `${redisInfo.info?.blocked_clients || 0} blocked`,
                        color: '#4CAF50',
                        icon: <TeamOutlined />,
                      },
                      {
                        label: t('redis.ops_per_sec'),
                        value: ops.toLocaleString(),
                        sub: `${totalCmds.toLocaleString()} ${t('redis.total_commands').toLowerCase()}`,
                        color: '#2196F3',
                        icon: <ThunderboltOutlined />,
                      },
                      {
                        label: t('redis.hit_rate'),
                        value: `${hitRate.toFixed(2)}%`,
                        sub: `${hits.toLocaleString()} / ${(hits + misses).toLocaleString()}`,
                        color: hitRate >= 90 ? '#4CAF50' : hitRate >= 70 ? '#FF9800' : '#F44336',
                        icon: <FundOutlined />,
                      },
                      {
                        label: t('redis.total_connections'),
                        value: totalConns.toLocaleString(),
                        sub: `expired: ${Number(redisInfo.info?.expired_keys || 0).toLocaleString()}`,
                        color: '#607D8B',
                        icon: <ClusterOutlined />,
                      },
                      {
                        label: t('redis.connected_slaves'),
                        value: String(redisReplication?.connected_slaves ?? 0),
                        sub: redisReplication?.role === 'slave'
                          ? `link: ${redisReplication?.master_link_status === 'up' ? '✓ UP' : '✗ DOWN'}`
                          : `offset: ${Number(redisReplication?.master_repl_offset || 0).toLocaleString()}`,
                        color: '#E91E63',
                        icon: <BranchesOutlined />,
                      },
                    ];
                    return cards.map((c, i) => (
                      <div key={i} style={{
                        padding: '12px 14px', borderRadius: 10,
                        background: `${c.color}08`,
                        border: `1px solid ${c.color}25`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 10, color: p.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 500 }}>{c.label}</span>
                          <span style={{ color: c.color, fontSize: 14, opacity: 0.85 }}>{c.icon}</span>
                        </div>
                        <div style={{ fontSize: 19, fontWeight: 700, color: c.color, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>{c.value}</div>
                        {c.sub && <div style={{ fontSize: 10.5, color: p.textMuted, marginTop: 2 }}>{c.sub}</div>}
                        {typeof c.progress === 'number' && (
                          <div style={{ marginTop: 8 }}>
                            <div style={{
                              height: 4, borderRadius: 2, background: p.barTrack || '#E2E8F0', overflow: 'hidden',
                            }}>
                              <div style={{
                                width: `${Math.min(100, c.progress)}%`, height: '100%',
                                background: c.progressColor || c.color,
                                transition: 'width 0.3s',
                              }} />
                            </div>
                          </div>
                        )}
                      </div>
                    ));
                  })()}
                </div>

                {/* Two-column layout: memory gauge + server info | clients + databases + persistence */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                  gap: 16, padding: 20,
                }}>
                  {/* Memory usage card with gauge */}
                  <div style={{
                    background: p.card, border: `1px solid ${p.cardBorder}`,
                    borderRadius: 12, overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '12px 16px', borderBottom: `1px solid ${p.cardBorder}`,
                      background: p.headerBg, display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <ApiOutlined style={{ color: '#FF9800' }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>{t('redis.memory')}</span>
                    </div>
                    <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                      {(() => {
                        const memUsed = Number(redisInfo.memory?.used_memory || 0);
                        const memMax = Number(redisInfo.memory?.max_memory || 0);
                        const memPct = memMax > 0 ? Math.min(100, (memUsed / memMax) * 100) : 0;
                        const strokeColor = memPct > 90 ? p.red : memPct > 70 ? p.amber : p.green;
                        return (
                          <div style={{ flexShrink: 0 }}>
                            <Progress
                              type="dashboard"
                              percent={memPct}
                              size={110}
                              strokeColor={strokeColor}
                              format={(p) => memMax > 0 ? `${p?.toFixed(0)}%` : '∞'}
                            />
                            <div style={{ fontSize: 11, color: p.textMuted, textAlign: 'center', marginTop: 4 }}>
                              {memMax > 0 ? `${redisInfo.memory?.used_memory_human || '—'} / ${redisInfo.memory?.max_memory_human || '—'}` : t('redis.unlimited')}
                            </div>
                          </div>
                        );
                      })()}
                      <div style={{ flex: 1, minWidth: 160 }}>
                        {[
                          { label: t('redis.used_memory'), value: redisInfo.memory?.used_memory_human || '—' },
                          { label: t('redis.peak_memory'), value: redisInfo.memory?.used_memory_peak_human || '—' },
                          { label: t('redis.max_memory'), value: redisInfo.memory?.max_memory_human || t('redis.unlimited') },
                          { label: t('redis.fragmentation_ratio'), value: redisInfo.memory?.mem_frag_ratio || '—' },
                          { label: t('redis.eviction_policy'), value: <Tag color="red" style={{ fontSize: 10, padding: '0 6px', margin: 0 }}>{redisInfo.memory?.max_memory_policy || 'noeviction'}</Tag> },
                        ].map((r, i) => (
                          <div key={i} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '6px 0',
                            borderBottom: i < 4 ? `1px dashed ${p.cardBorder}` : 'none',
                          }}>
                            <span style={{ fontSize: 11, color: p.textMuted }}>{r.label}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: p.text, fontVariantNumeric: 'tabular-nums' }}>{r.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Server info card */}
                  <div style={{
                    background: p.card, border: `1px solid ${p.cardBorder}`,
                    borderRadius: 12, overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '12px 16px', borderBottom: `1px solid ${p.cardBorder}`,
                      background: p.headerBg, display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <DashboardOutlined style={{ color: p.accent }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>{t('redis.server')}</span>
                    </div>
                    <div style={{ padding: 16 }}>
                      {[
                        { label: t('redis.version'), value: redisInfo.info?.redis_version || '—' },
                        { label: t('redis.mode'), value: redisInfo.info?.redis_mode || 'standalone' },
                        { label: t('redis.role'), value: <Tag color={redisReplication?.role === 'master' ? 'red' : 'orange'} style={{ margin: 0 }}>{(redisReplication?.role || 'master').toUpperCase()}</Tag> },
                        { label: t('redis.os'), value: redisInfo.info?.os || '—' },
                        { label: t('redis.process_id'), value: redisInfo.info?.process_id || '—' },
                        { label: t('redis.tcp_port'), value: redisInfo.info?.tcp_port || '6379' },
                        { label: t('redis.uptime'), value: formatUptime(Number(redisInfo.info?.uptime_in_seconds || 0)) },
                        { label: t('redis.uptime_days'), value: redisInfo.info?.uptime_in_days || '0' },
                        { label: t('redis.config_file'), value: <code style={{ fontSize: 10, color: p.textMuted, background: p.codeBg, padding: '1px 6px', borderRadius: 3 }}>{redisInfo.info?.config_file || '—'}</code> },
                      ].map((r, i) => (
                        <div key={i} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '6px 0',
                          borderBottom: i < 8 ? `1px dashed ${p.cardBorder}` : 'none',
                        }}>
                          <span style={{ fontSize: 11, color: p.textMuted }}>{r.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 500, color: p.text, textAlign: 'right' }}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Performance stats card */}
                <div style={{ padding: '0 20px 20px' }}>
                  <div style={{
                    background: p.card, border: `1px solid ${p.cardBorder}`,
                    borderRadius: 12, overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '12px 16px', borderBottom: `1px solid ${p.cardBorder}`,
                      background: p.headerBg, display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <ThunderboltOutlined style={{ color: p.amber }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>{t('redis.performance')}</span>
                    </div>
                    <div style={{
                      display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
                      gap: 0,
                    }}>
                      {(() => {
                        const hits = Number(redisInfo.info?.keyspace_hits || 0);
                        const misses = Number(redisInfo.info?.keyspace_misses || 0);
                        const total = hits + misses;
                        const hitPct = total > 0 ? (hits / total) * 100 : 0;
                        const missPct = total > 0 ? (misses / total) * 100 : 0;
                        const perfItems = [
                          { label: t('redis.total_connections'), value: Number(redisInfo.info?.total_connections_received || 0).toLocaleString(), color: p.accent, icon: <ClusterOutlined /> },
                          { label: t('redis.total_commands'), value: Number(redisInfo.info?.total_commands_processed || 0).toLocaleString(), color: p.purple, icon: <CodeOutlined /> },
                          { label: t('redis.ops_per_sec'), value: Number(redisInfo.info?.instantaneous_ops_per_sec || 0).toLocaleString(), color: p.amber, icon: <ThunderboltOutlined /> },
                          { label: t('redis.keyspace_hits'), value: hits.toLocaleString(), color: p.green, icon: <RiseOutlined /> },
                          { label: t('redis.keyspace_misses'), value: misses.toLocaleString(), color: p.red, icon: <FallOutlined /> },
                          { label: t('redis.hit_rate'), value: `${hitPct.toFixed(2)}%`, color: hitPct >= 90 ? p.green : hitPct >= 70 ? p.amber : p.red, icon: <FundOutlined />, progress: hitPct },
                          { label: t('redis.expired_keys'), value: Number(redisInfo.info?.expired_keys || 0).toLocaleString(), color: p.textMuted, icon: <ClockCircleOutlined /> },
                          { label: t('redis.evicted_keys'), value: Number(redisInfo.info?.evicted_keys || 0).toLocaleString(), color: p.redDim, icon: <DeleteOutlined /> },
                        ];
                        return perfItems.map((it, i) => (
                          <div key={i} style={{
                            padding: '14px 16px',
                            borderRight: !isMobile && (i % 4 < 3) ? `1px solid ${p.cardBorder}` : 'none',
                            borderBottom: isMobile && (i % 2 === 0) ? `1px solid ${p.cardBorder}` : (!isMobile && i < perfItems.length - 4 ? `1px solid ${p.cardBorder}` : 'none'),
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: 10, color: p.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 }}>{it.label}</span>
                              <span style={{ color: it.color, fontSize: 12, opacity: 0.7 }}>{it.icon}</span>
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: it.color, fontVariantNumeric: 'tabular-nums' }}>{it.value}</div>
                            {typeof it.progress === 'number' && (
                              <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: p.barTrack, overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(100, it.progress)}%`, height: '100%', background: it.color, transition: 'width 0.3s' }} />
                              </div>
                            )}
                            {/* Hit rate bar visualization */}
                            {it.label === t('redis.keyspace_hits') && total > 0 && (
                              <div style={{ marginTop: 6 }}>
                                <div style={{ height: 3, borderRadius: 2, background: p.barTrack, overflow: 'hidden', display: 'flex' }}>
                                  <div style={{ width: `${hitPct}%`, background: p.green }} />
                                  <div style={{ width: `${missPct}%`, background: p.red }} />
                                </div>
                              </div>
                            )}
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>

                {/* Persistence + Replication row */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                  gap: 16, padding: '0 20px 20px',
                }}>
                  {/* Persistence card */}
                  <div style={{
                    background: p.card, border: `1px solid ${p.cardBorder}`,
                    borderRadius: 12, overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '12px 16px', borderBottom: `1px solid ${p.cardBorder}`,
                      background: p.headerBg, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <SaveOutlined style={{ color: p.accent }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>{t('redis.persistence')}</span>
                      </div>
                      <button
                        onClick={handleRedisBgsave}
                        disabled={redisPersistence?.rdb_current_save}
                        style={{
                          padding: '3px 10px', borderRadius: 5, border: `1px solid ${p.cardBorder}`,
                          background: 'transparent', color: p.textMuted, fontSize: 10, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <SaveOutlined /> {redisPersistence?.rdb_current_save ? t('redis.saving_now') : t('redis.save_now')}
                      </button>
                    </div>
                    <div style={{ padding: 12 }}>
                      {/* RDB / AOF badges */}
                      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                        <Tag color={redisPersistence?.rdb_enabled ? 'green' : 'default'} style={{ fontSize: 10, padding: '2px 8px', margin: 0 }}>
                          <HddOutlined /> RDB {redisPersistence?.rdb_enabled ? 'ON' : 'OFF'}
                        </Tag>
                        <Tag color={redisPersistence?.aof_enabled ? 'green' : 'default'} style={{ fontSize: 10, padding: '2px 8px', margin: 0 }}>
                          <FileTextOutlined /> AOF {redisPersistence?.aof_enabled ? 'ON' : 'OFF'}
                        </Tag>
                        {redisPersistence?.rdb_current_save && (
                          <Tag color="orange" style={{ fontSize: 10, padding: '2px 8px', margin: 0 }}>
                            <LoadingOutlined /> {t('redis.saving_now')}
                          </Tag>
                        )}
                      </div>
                      {[
                        { label: t('redis.last_save_time'), value: redisPersistence?.rdb_last_save_time ? formatDateTime(redisPersistence.rdb_last_save_time * 1000) : '—' },
                        { label: t('redis.last_status'), value: <Tag color={redisPersistence?.rdb_last_status === 'ok' ? 'green' : 'red'} style={{ fontSize: 10, padding: '0 6px', margin: 0 }}>{redisPersistence?.rdb_last_status || '—'}</Tag> },
                        { label: 'AOF size', value: redisPersistence?.aof_current_size ? formatBytes(redisPersistence.aof_current_size) : '—' },
                        { label: 'AOF base size', value: redisPersistence?.aof_base_size ? formatBytes(redisPersistence.aof_base_size) : '—' },
                      ].map((r, i) => (
                        <div key={i} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '5px 0',
                          borderBottom: i < 3 ? `1px dashed ${p.cardBorder}` : 'none',
                        }}>
                          <span style={{ fontSize: 11, color: p.textMuted }}>{r.label}</span>
                          <span style={{ fontSize: 11, fontWeight: 500, color: p.text, textAlign: 'right' }}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Replication card */}
                  <div style={{
                    background: p.card, border: `1px solid ${p.cardBorder}`,
                    borderRadius: 12, overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '12px 16px', borderBottom: `1px solid ${p.cardBorder}`,
                      background: p.headerBg, display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <BranchesOutlined style={{ color: '#E91E63' }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>{t('redis.replication')}</span>
                      {redisReplication?.role && (
                        <Tag color={redisReplication.role === 'master' ? 'red' : 'orange'} style={{ marginLeft: 'auto', fontSize: 10, padding: '0 6px' }}>
                          {redisReplication.role.toUpperCase()}
                        </Tag>
                      )}
                    </div>
                    <div style={{ padding: 12 }}>
                      {!redisReplication || redisReplication.role === 'master' ? (
                        <>
                          {[
                            { label: t('redis.role'), value: <Tag color="red" style={{ margin: 0 }}>MASTER</Tag> },
                            { label: t('redis.connected_slaves'), value: String(redisReplication?.connected_slaves ?? 0), color: '#E91E63' },
                            { label: t('redis.master_repl_offset'), value: Number(redisReplication?.master_repl_offset || 0).toLocaleString() },
                          ].map((r, i) => (
                            <div key={i} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '5px 0',
                              borderBottom: i < 2 ? `1px dashed ${p.cardBorder}` : 'none',
                            }}>
                              <span style={{ fontSize: 11, color: p.textMuted }}>{r.label}</span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: r.color || p.text, textAlign: 'right' }}>{r.value}</span>
                            </div>
                          ))}
                          {(!redisReplication?.connected_slaves || redisReplication.connected_slaves === 0) && (
                            <div style={{ fontSize: 11, color: p.textMuted, marginTop: 8, textAlign: 'center', fontStyle: 'italic' }}>
                              {t('redis.no_replication')}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {[
                            { label: t('redis.role'), value: <Tag color="orange" style={{ margin: 0 }}>SLAVE</Tag> },
                            { label: t('redis.master_host'), value: redisReplication?.master_host || '—' },
                            { label: t('redis.master_port'), value: redisReplication?.master_port || '—' },
                            { label: t('redis.master_link_status'), value: <Tag color={redisReplication?.master_link_status === 'up' ? 'green' : 'red'} style={{ margin: 0 }}>{(redisReplication?.master_link_status || '—').toUpperCase()}</Tag> },
                            { label: t('redis.master_repl_offset'), value: Number(redisReplication?.master_repl_offset || 0).toLocaleString() },
                          ].map((r, i) => (
                            <div key={i} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '5px 0',
                              borderBottom: i < 4 ? `1px dashed ${p.cardBorder}` : 'none',
                            }}>
                              <span style={{ fontSize: 11, color: p.textMuted }}>{r.label}</span>
                              <span style={{ fontSize: 11, fontWeight: 500, color: p.text, textAlign: 'right' }}>{r.value}</span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Databases table + Clients table */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                  gap: 16, padding: '0 20px 20px',
                }}>
                  {/* Keyspace / Databases */}
                  <div style={{
                    background: p.card, border: `1px solid ${p.cardBorder}`,
                    borderRadius: 12, overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '12px 16px', borderBottom: `1px solid ${p.cardBorder}`,
                      background: p.headerBg, display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <DatabaseOutlined style={{ color: '#DC382D' }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>{t('redis.keyspace')}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: p.textMuted }}>{redisDbOverview.length} {t('redis.databases').toLowerCase()}</span>
                    </div>
                    <div style={{ padding: 0 }}>
                      {redisDbOverview.length === 0 ? (
                        <div style={{ padding: 30, textAlign: 'center', color: p.textMuted, fontSize: 12 }}>{t('redis.no_active_dbs')}</div>
                      ) : (
                        <Table
                          dataSource={redisDbOverview}
                          rowKey="db"
                          size="small"
                          pagination={false}
                          style={{ fontSize: 12 }}
                          columns={[
                            {
                              title: t('redis.db'), dataIndex: 'db', key: 'db', width: 70,
                              render: (v: number) => <span style={{ fontWeight: 600, color: '#DC382D' }}>DB {v}</span>,
                            },
                            {
                              title: t('redis.keys'), dataIndex: 'keys', key: 'keys',
                              render: (v: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(v || 0).toLocaleString()}</span>,
                            },
                            {
                              title: t('redis.expires'), dataIndex: 'expires', key: 'expires',
                              render: (v: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(v || 0).toLocaleString()}</span>,
                            },
                            {
                              title: t('redis.avg_ttl'), dataIndex: 'avg_ttl', key: 'avg_ttl', width: 100,
                              render: (v: number) => v > 0 ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>{(v / 1000).toFixed(1)}s</span> : <span style={{ color: p.textMuted }}>—</span>,
                            },
                            {
                              title: '', key: 'actions', width: 60,
                              render: (_: any, row: any) => (
                                <Popconfirm
                                  title={t('redis.flush_db_confirm', { db: row.db })}
                                  onConfirm={() => handleRedisFlush(row.db)}
                                  okText={t('common.delete')}
                                  okButtonProps={{ danger: true }}
                                >
                                  <button
                                    disabled={redisFlushLoading === `db-${row.db}`}
                                    style={{
                                      padding: '2px 8px', borderRadius: 4, border: `1px solid ${p.red}40`,
                                      background: 'transparent', color: p.red, fontSize: 10, cursor: 'pointer',
                                      display: 'inline-flex', alignItems: 'center', gap: 3,
                                    }}
                                  >
                                    {redisFlushLoading === `db-${row.db}` ? <LoadingOutlined /> : <DeleteOutlined />} {t('redis.flush')}
                                  </button>
                                </Popconfirm>
                              ),
                            },
                          ]}
                        />
                      )}
                    </div>
                  </div>

                  {/* Connected clients */}
                  <div style={{
                    background: p.card, border: `1px solid ${p.cardBorder}`,
                    borderRadius: 12, overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '12px 16px', borderBottom: `1px solid ${p.cardBorder}`,
                      background: p.headerBg, display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <TeamOutlined style={{ color: '#4CAF50' }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>{t('redis.connected_clients')}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: p.textMuted }}>{redisInfo.clients?.length || 0}</span>
                    </div>
                    <div style={{ padding: 0 }}>
                      {!redisInfo.clients || redisInfo.clients.length === 0 ? (
                        <div style={{ padding: 30, textAlign: 'center', color: p.textMuted, fontSize: 12 }}>{t('redis.no_clients')}</div>
                      ) : (
                        <Table
                          dataSource={redisInfo.clients}
                          rowKey={(r: any) => r.id || `${r.addr}-${r.db}`}
                          size="small"
                          pagination={{ pageSize: 5, size: 'small', showSizeChanger: false }}
                          style={{ fontSize: 12 }}
                          columns={[
                            { title: t('redis.address'), dataIndex: 'addr', key: 'addr', ellipsis: true },
                            { title: t('redis.name'), dataIndex: 'name', key: 'name', width: 90, render: (v: string) => v ? <Tag style={{ fontSize: 10, margin: 0 }}>{v}</Tag> : <span style={{ color: p.textMuted }}>—</span> },
                            { title: 'DB', dataIndex: 'db', key: 'db', width: 50 },
                            { title: t('redis.command'), dataIndex: 'cmd', key: 'cmd', width: 90, render: (v: string) => <code style={{ fontSize: 10, background: p.codeBg, padding: '1px 4px', borderRadius: 3 }}>{v || '—'}</code> },
                            { title: t('redis.idle'), dataIndex: 'idle', key: 'idle', width: 60, render: (v: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(v || 0)}s</span> },
                            {
                              title: '', key: 'actions', width: 50,
                              render: (_: any, row: any) => (
                                <Popconfirm
                                  title={t('redis.kill_client_confirm')}
                                  onConfirm={() => handleRedisKillClient(row.id)}
                                  okText={t('common.delete')}
                                  okButtonProps={{ danger: true }}
                                >
                                  <button
                                    style={{
                                      padding: '2px 6px', borderRadius: 4, border: `1px solid ${p.red}40`,
                                      background: 'transparent', color: p.red, fontSize: 10, cursor: 'pointer',
                                    }}
                                    title={t('redis.kill_client')}
                                  >
                                    <DeleteOutlined />
                                  </button>
                                </Popconfirm>
                              ),
                            },
                          ]}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* MongoDB content */}
        {activeDbTab === 'mongodb' && (
          <div style={{ padding: 0 }}>
            {/* MongoDB Toolbar */}
            <div style={{
              display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
              padding: '10px 20px',
              borderBottom: `1px solid ${p.cardBorder}`,
            }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['databases', 'users'] as const).map(v => (
                  <button key={v} onClick={() => setMongoView(v)} style={{
                    padding: '4px 12px', borderRadius: 6,
                    border: mongoView === v ? `1px solid #47A24840` : `1px solid ${p.cardBorder}`,
                    background: mongoView === v ? '#47A24815' : 'transparent',
                    color: mongoView === v ? '#47A248' : p.textMuted,
                    fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  }}>
                    {v === 'databases' ? <><DatabaseOutlined /> Databases</> : <><TeamOutlined /> Users</>}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1 }} />
              {mongoStats?.version && (
                <Popover
                  trigger="hover"
                  placement="bottom"
                  arrow={false}
                  overlayInnerStyle={{ padding: 0, background: p.card, border: `1px solid ${p.cardBorder}`, borderRadius: 8 }}
                  content={
                    <div style={{ display: 'flex', gap: 4, padding: '6px 8px' }}>
                      {([
                        { action: 'restart', icon: <SyncOutlined />, label: 'Restart', color: p.amber },
                        { action: 'stop', icon: <PoweroffOutlined />, label: 'Stop', color: p.red },
                        { action: 'start', icon: <PlayCircleOutlined />, label: 'Start', color: p.green },
                      ] as const).map(btn => (
                        <Tooltip key={btn.action} title={btn.label}>
                          <button
                            onClick={() => handleServiceAction(btn.action)}
                            disabled={!!serviceActionLoading}
                            style={{
                              width: 30, height: 30, borderRadius: 6,
                              border: `1px solid ${p.cardBorder}`, background: 'transparent',
                              color: btn.color, cursor: 'pointer', display: 'inline-flex',
                              alignItems: 'center', justifyContent: 'center', fontSize: 13,
                            }}
                          >
                            {serviceActionLoading === btn.action ? <LoadingOutlined /> : btn.icon}
                          </button>
                        </Tooltip>
                      ))}
                    </div>
                  }
                >
                  <span style={{
                    fontSize: 11, padding: '2px 9px', borderRadius: 4,
                    background: '#47A24815', color: '#47A248', fontWeight: 500,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                    v{mongoStats.version}
                  </span>
                </Popover>
              )}
              <button onClick={fetchMongoDatabases} style={{
                padding: '4px 12px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
                background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
                <ReloadOutlined /> Refresh
              </button>
              {mongoView === 'databases' && (
                <button onClick={() => setMongoCreateDbOpen(true)} style={{
                  padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: '#47A248', color: '#fff', fontSize: 12, fontWeight: 500,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}>
                  <PlusOutlined /> Create Database
                </button>
              )}
              {mongoView === 'users' && (
                <button onClick={() => setMongoCreateUserOpen(true)} style={{
                  padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: '#47A248', color: '#fff', fontSize: 12, fontWeight: 500,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}>
                  <PlusOutlined /> Create User
                </button>
              )}
            </div>

            {/* MongoDB Stats Overview */}
            {mongoStats && (
              <div style={{ padding: '12px 20px', borderBottom: `1px solid ${p.cardBorder}` }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                  {[
                    { label: 'Storage Engine', value: mongoStats.storageEngine || '—', color: '#47A248' },
                    { label: 'Uptime', value: mongoStats.uptime ? `${Math.floor(mongoStats.uptime / 3600)}h ${Math.floor((mongoStats.uptime % 3600) / 60)}m` : '—', color: '#336791' },
                    { label: 'Connections', value: mongoStats.connections?.current?.toString() || '0', color: '#DC382D' },
                    { label: 'Memory (Res)', value: mongoStats.mem?.resident ? `${mongoStats.mem.resident} MB` : '—', color: '#FF9800' },
                    { label: 'Inserts', value: mongoStats.opcounters?.insert?.toLocaleString?.() || '0', color: '#4CAF50' },
                    { label: 'Queries', value: mongoStats.opcounters?.query?.toLocaleString?.() || '0', color: '#2196F3' },
                  ].map((stat, idx) => (
                    <div key={idx} style={{
                      padding: '8px 12px', borderRadius: 8,
                      background: `${stat.color}08`, border: `1px solid ${stat.color}20`,
                    }}>
                      <div style={{ fontSize: 10, color: p.textMuted, marginBottom: 2 }}>{stat.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: stat.color }}>{stat.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {mongoLoading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> : (
              <>
                {/* Databases view */}
                {mongoView === 'databases' && (
                  <div style={{ padding: '0 20px 20px' }}>
                    {/* Search */}
                    <div style={{ padding: '12px 0 8px' }}>
                      <Input
                        prefix={<SearchOutlined style={{ color: p.textMuted }} />}
                        placeholder="Search databases..."
                        value={mongoSearchText}
                        onChange={e => setMongoSearchText(e.target.value)}
                        style={{ width: 260, borderRadius: 6 }}
                        allowClear
                      />
                    </div>

                    {/* Two-panel: DB list + collections */}
                    <div style={{ display: 'flex', gap: 16, minHeight: 300 }}>
                      {/* DB List */}
                      <div style={{ flex: mongoSelectedDb ? '0 0 340px' : 1, transition: 'flex 0.2s' }}>
                        <Table
                          dataSource={mongoDatabases
                            .filter(d => !mongoSearchText || d.name?.toLowerCase().includes(mongoSearchText.toLowerCase()))
                          }
                          rowKey="name"
                          size="small"
                          pagination={false}
                          rowSelection={{
                            selectedRowKeys: mongoSelectedRowKeys,
                            onChange: keys => setMongoSelectedRowKeys(keys),
                          }}
                          onRow={record => ({
                            onClick: () => {
                              setMongoSelectedDb(record.name);
                              fetchMongoCollections(record.name);
                            },
                            style: {
                              cursor: 'pointer',
                              background: mongoSelectedDb === record.name ? `${p.accent}08` : undefined,
                            },
                          })}
                          columns={[
                            {
                              title: 'Database', dataIndex: 'name', key: 'name',
                              render: (name: string) => (
                                <span style={{ fontWeight: 500, color: p.text }}>
                                  <DatabaseOutlined style={{ marginRight: 6, color: '#47A248' }} />{name}
                                </span>
                              ),
                            },
                            {
                              title: 'Size', dataIndex: 'sizeOnDisk', key: 'size', width: 100,
                              render: (size: number) => <span style={{ color: p.textMuted, fontSize: 12 }}>{formatSize(size || 0)}</span>,
                            },
                            {
                              title: '', key: 'actions', width: 60, align: 'center' as const,
                              render: (_: any, record: any) => (
                                <Popconfirm
                                  title={`Drop database "${record.name}"?`}
                                  description="This action cannot be undone."
                                  onConfirm={async (e) => {
                                    e?.stopPropagation();
                                    try {
                                      await api.delete(`/software/mongodb/databases/${record.name}`);
                                      message.success('Database dropped');
                                      if (mongoSelectedDb === record.name) {
                                        setMongoSelectedDb(null);
                                        setMongoCollections([]);
                                      }
                                      fetchMongoDatabases();
                                    } catch { message.error('Failed to drop database'); }
                                  }}
                                  onCancel={e => e?.stopPropagation()}
                                >
                                  <button onClick={e => e.stopPropagation()} style={{
                                    background: 'transparent', border: 'none', cursor: 'pointer',
                                    color: p.red, fontSize: 13, padding: '4px 6px', borderRadius: 4,
                                  }}>
                                    <DeleteOutlined />
                                  </button>
                                </Popconfirm>
                              ),
                            },
                          ]}
                        />
                        {mongoSelectedRowKeys.length > 0 && (
                          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: p.textMuted }}>{mongoSelectedRowKeys.length} selected</span>
                            <Popconfirm
                              title={`Drop ${mongoSelectedRowKeys.length} database(s)?`}
                              onConfirm={async () => {
                                for (const name of mongoSelectedRowKeys) {
                                  try { await api.delete(`/software/mongodb/databases/${name}`); } catch { /* skip */ }
                                }
                                setMongoSelectedRowKeys([]);
                                setMongoSelectedDb(null);
                                setMongoCollections([]);
                                fetchMongoDatabases();
                                message.success('Databases dropped');
                              }}
                            >
                              <button style={{
                                padding: '3px 10px', borderRadius: 5, border: `1px solid ${p.red}40`,
                                background: `${p.red}10`, color: p.red, fontSize: 11, cursor: 'pointer',
                              }}>
                                <DeleteOutlined /> Drop Selected
                              </button>
                            </Popconfirm>
                          </div>
                        )}
                      </div>

                      {/* Collections panel */}
                      {mongoSelectedDb && (
                        <div style={{
                          flex: 1, borderLeft: `1px solid ${p.cardBorder}`, paddingLeft: 16,
                          animation: 'fadeIn 0.2s',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>
                              <DatabaseOutlined style={{ color: '#47A248', marginRight: 6 }} />
                              {mongoSelectedDb}
                              <span style={{ fontSize: 11, color: p.textMuted, marginLeft: 8 }}>
                                ({mongoCollections.length} collection{mongoCollections.length !== 1 ? 's' : ''})
                              </span>
                            </span>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={() => fetchMongoCollections(mongoSelectedDb)} style={{
                                padding: '3px 10px', borderRadius: 5, border: `1px solid ${p.cardBorder}`,
                                background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
                              }}>
                                <ReloadOutlined />
                              </button>
                              <button onClick={() => setMongoCreateCollOpen(true)} style={{
                                padding: '3px 10px', borderRadius: 5, border: 'none',
                                background: '#47A248', color: '#fff', fontSize: 11, cursor: 'pointer',
                              }}>
                                <PlusOutlined /> Collection
                              </button>
                              <button onClick={() => { setMongoSelectedDb(null); setMongoCollections([]); }} style={{
                                padding: '3px 8px', borderRadius: 5, border: `1px solid ${p.cardBorder}`,
                                background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
                              }}>
                                ✕
                              </button>
                            </div>
                          </div>
                          {mongoCollLoading ? <div style={{ textAlign: 'center', padding: 20 }}><Spin size="small" /></div> : (
                            <Table
                              dataSource={mongoCollections}
                              rowKey="name"
                              size="small"
                              pagination={false}
                              columns={[
                                {
                                  title: 'Collection', dataIndex: 'name', key: 'name',
                                  render: (name: string, record: any) => (
                                    <span style={{ fontWeight: 500, color: p.text, fontSize: 12 }}>
                                      {name}
                                      {record.type === 'view' && <span style={{ marginLeft: 6, fontSize: 10, color: p.amber }}>(view)</span>}
                                    </span>
                                  ),
                                },
                                {
                                  title: 'Documents', dataIndex: 'count', key: 'count', width: 90,
                                  render: (v: number) => <span style={{ color: p.textMuted, fontSize: 12 }}>{(v || 0).toLocaleString()}</span>,
                                },
                                {
                                  title: 'Size', dataIndex: 'size', key: 'size', width: 90,
                                  render: (v: number) => <span style={{ color: p.textMuted, fontSize: 12 }}>{formatSize(v || 0)}</span>,
                                },
                                {
                                  title: 'Indexes', dataIndex: 'indexCount', key: 'indexCount', width: 70,
                                  render: (v: number) => <span style={{ color: p.textMuted, fontSize: 12 }}>{v || 0}</span>,
                                },
                                {
                                  title: '', key: 'actions', width: 50, align: 'center' as const,
                                  render: (_: any, record: any) => (
                                    <Popconfirm
                                      title={`Drop collection "${record.name}"?`}
                                      onConfirm={async () => {
                                        try {
                                          await api.delete(`/software/mongodb/databases/${mongoSelectedDb}/collections/${record.name}`);
                                          message.success('Collection dropped');
                                          fetchMongoCollections(mongoSelectedDb);
                                          fetchMongoDatabases();
                                        } catch { message.error('Failed to drop collection'); }
                                      }}
                                    >
                                      <button style={{
                                        background: 'transparent', border: 'none', cursor: 'pointer',
                                        color: p.red, fontSize: 12,
                                      }}>
                                        <DeleteOutlined />
                                      </button>
                                    </Popconfirm>
                                  ),
                                },
                              ]}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Users view */}
                {mongoView === 'users' && (
                  <div style={{ padding: '12px 20px 20px' }}>
                    <Table
                      dataSource={mongoUsers}
                      rowKey={(r: any) => `${r.db}/${r.user}`}
                      size="small"
                      pagination={false}
                      columns={[
                        {
                          title: 'Username', dataIndex: 'user', key: 'user',
                          render: (user: string) => <span style={{ fontWeight: 500, color: p.text }}><TeamOutlined style={{ marginRight: 6, color: '#47A248' }} />{user}</span>,
                        },
                        {
                          title: 'Database', dataIndex: 'db', key: 'db',
                          render: (db: string) => <span style={{ color: p.textMuted, fontSize: 12 }}>{db}</span>,
                        },
                        {
                          title: 'Roles', dataIndex: 'roles', key: 'roles',
                          render: (roles: any[]) => (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {(roles || []).map((r: any, i: number) => (
                                <span key={i} style={{
                                  fontSize: 10, padding: '1px 6px', borderRadius: 4,
                                  background: `#47A24815`, color: '#47A248', fontWeight: 500,
                                }}>
                                  {r.role}@{r.db}
                                </span>
                              ))}
                            </div>
                          ),
                        },
                        {
                          title: '', key: 'actions', width: 50, align: 'center' as const,
                          render: (_: any, record: any) => (
                            <Popconfirm
                              title={`Drop user "${record.user}" from "${record.db}"?`}
                              onConfirm={async () => {
                                try {
                                  await api.delete(`/software/mongodb/users/${record.db}/${record.user}`);
                                  message.success('User dropped');
                                  fetchMongoDatabases();
                                } catch { message.error('Failed to drop user'); }
                              }}
                            >
                              <button style={{
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                color: p.red, fontSize: 13,
                              }}>
                                <DeleteOutlined />
                              </button>
                            </Popconfirm>
                          ),
                        },
                      ]}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        </div>{/* end tab content area */}
      </div>

      {/* Add Database Modal */}
      <AddDatabaseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => { fetchData(); message.success(t('common.success')); }}
        detectedDbType={detectedDbType}
      />

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
              minWidth: 0,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: p.text, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <CloudUploadOutlined style={{ color: p.accent, flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '45%' }}>
                    Backup — {backupDb.name}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: p.textMuted, marginTop: 2 }}>
                  {backupList.length} backup(s) available
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <select
                  value={backupStorage}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBackupStorage(val);
                    if (val === 'local') {
                      setBackupStorageId(null);
                    } else if (val === 'ftp') {
                      setBackupStorageId(ftpStorages.length > 0 ? ftpStorages[0].id : null);
                    } else {
                      const filtered = cloudStorages.filter(s => s.type === val);
                      setBackupStorageId(filtered.length > 0 ? filtered[0].id : null);
                    }
                  }}
                  style={{
                    padding: '5px 8px', borderRadius: 6, fontSize: 11,
                    border: `1px solid ${p.cardBorder}`, background: p.card, color: p.text,
                    cursor: 'pointer', outline: 'none', flexShrink: 0,
                  }}
                >
                  <option value="local">💾 Local</option>
                  {ftpStorages.length > 0 && <option value="ftp">📁 FTP</option>}
                  {cloudStorages.filter(s => s.type === 's3').length > 0 && <option value="s3">☁️ S3</option>}
                  {cloudStorages.filter(s => s.type === 'google_drive').length > 0 && <option value="google_drive">☁️ GDrive</option>}
                  {cloudStorages.filter(s => s.type === 'onedrive').length > 0 && <option value="onedrive">☁️ OneDrive</option>}
                </select>
                {backupStorage === 'ftp' && ftpStorages.length > 1 && (
                  <select
                    value={backupStorageId ?? ''}
                    onChange={(e) => setBackupStorageId(Number(e.target.value))}
                    style={{
                      padding: '5px 8px', borderRadius: 6, fontSize: 11,
                      border: `1px solid ${p.cardBorder}`, background: p.card, color: p.text,
                      cursor: 'pointer', outline: 'none', flexShrink: 0,
                    }}
                  >
                    {ftpStorages.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}
                {['s3', 'google_drive', 'onedrive'].includes(backupStorage) && cloudStorages.filter(s => s.type === backupStorage).length > 1 && (
                  <select
                    value={backupStorageId ?? ''}
                    onChange={(e) => setBackupStorageId(Number(e.target.value))}
                    style={{
                      padding: '5px 8px', borderRadius: 6, fontSize: 11,
                      border: `1px solid ${p.cardBorder}`, background: p.card, color: p.text,
                      cursor: 'pointer', outline: 'none', flexShrink: 0,
                    }}
                  >
                    {cloudStorages.filter(s => s.type === backupStorage).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}
                {/* Strategy picker + Backup button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <label style={{ cursor: 'pointer', color: backupStrategy === 'full' ? p.accent : p.textMuted, fontSize: 11, whiteSpace: 'nowrap' }}>
                    <input
                      type="radio"
                      name="backup-strategy-db"
                      value="full"
                      checked={backupStrategy === 'full'}
                      onChange={() => setBackupStrategy('full')}
                      style={{ marginRight: 2 }}
                    />
                    Full
                  </label>
                  <label style={{ cursor: 'pointer', color: backupStrategy === 'incremental' ? p.accent : p.textMuted, fontSize: 11, whiteSpace: 'nowrap' }}>
                    <input
                      type="radio"
                      name="backup-strategy-db"
                      value="incremental"
                      checked={backupStrategy === 'incremental'}
                      onChange={() => setBackupStrategy('incremental')}
                      style={{ marginRight: 2 }}
                    />
                    Incr
                  </label>
                  <button
                    onClick={handleCreateBackup}
                    disabled={backupCreating}
                    style={{
                      padding: '6px 12px', borderRadius: 7, border: 'none',
                      background: p.accent, color: '#fff',
                      fontSize: 11, fontWeight: 600, cursor: backupCreating ? 'wait' : 'pointer',
                      opacity: backupCreating ? 0.7 : 1,
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      transition: 'all 0.15s', marginLeft: 2, flexShrink: 0,
                    }}
                  >
                    {backupCreating ? <Spin size="small" /> : <PlusOutlined />}
                    {backupCreating ? 'Creating...' : 'Backup'}
                  </button>
                </div>
              </div>
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
                      {['Filename', 'Storage', 'Size', 'Time', 'Actions'].map(h => (
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
                        ? formatDateTime(b.created_at, 'DD/MM/YYYY HH:mm')
                        : '—';
                      const isActing = backupActionId === b.id;
                      const storageBadges: { label: string; color: string }[] = [];
                      const st = b.storage || 'local';
                      if (st.includes('local')) storageBadges.push({ label: 'Local', color: p.green });
                      if (st.includes('ftp')) storageBadges.push({ label: 'FTP', color: p.cyan });
                      if (st.includes('s3')) storageBadges.push({ label: 'S3', color: p.amber });
                      if (st.includes('google_drive')) storageBadges.push({ label: 'GDrive', color: p.accent });
                      if (st.includes('onedrive')) storageBadges.push({ label: 'OneDrive', color: p.purple });
                      if (storageBadges.length === 0) storageBadges.push({ label: 'Local', color: p.green });
                      return (
                        <tr key={b.id} style={{ borderBottom: `1px solid ${p.cardBorder}` }}>
                          <td style={{ padding: '10px 16px' }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: p.text, wordBreak: 'break-all' }}>
                              {fileName}
                            </div>
                            {b.strategy === 'incremental' && (
                              <span style={{
                                fontSize: 9, fontWeight: 600, padding: '1px 5px',
                                borderRadius: 3, background: `${p.amber}18`, color: p.amber,
                                marginTop: 2, display: 'inline-block',
                              }}>Incremental</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {storageBadges.map(badge => (
                                <span key={badge.label} style={{
                                  fontSize: 9, fontWeight: 600, padding: '2px 6px',
                                  borderRadius: 3, background: `${badge.color}15`, color: badge.color,
                                }}>{badge.label}</span>
                              ))}
                            </div>
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

      <PostgresqlManageModal open={pgManageOpen} onClose={() => setPgManageOpen(false)} />
      <PgAdminManageModal open={pgaManageOpen} onClose={() => setPgaManageOpen(false)} />
      <RedisManageModal open={redisManageOpen} onClose={() => setRedisManageOpen(false)} />

      {/* MongoDB Create Database Modal */}
      <Modal
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><DatabaseOutlined style={{ color: '#47A248' }} /> Create MongoDB Database</span>}
        open={mongoCreateDbOpen}
        onOk={async () => {
          try {
            const values = await mongoDbForm.validateFields();
            setMongoSubmitting(true);
            await api.post('/software/mongodb/databases', { name: values.name });
            message.success('Database created');
            setMongoCreateDbOpen(false);
            mongoDbForm.resetFields();
            fetchMongoDatabases();
          } catch { message.error('Failed to create database'); }
          finally { setMongoSubmitting(false); }
        }}
        onCancel={() => { setMongoCreateDbOpen(false); mongoDbForm.resetFields(); }}
        confirmLoading={mongoSubmitting}
        okText="Create"
        cancelText="Cancel"
        destroyOnHidden
        width={420}
      >
        <Form form={mongoDbForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Database Name" rules={[
            { required: true, message: 'Database name is required' },
            { pattern: /^[a-zA-Z_][a-zA-Z0-9_-]*$/, message: 'Invalid database name' },
          ]}>
            <Input placeholder="my_database" />
          </Form.Item>
        </Form>
      </Modal>

      {/* MongoDB Create Collection Modal */}
      <Modal
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><DatabaseOutlined style={{ color: '#47A248' }} /> Create Collection in {mongoSelectedDb}</span>}
        open={mongoCreateCollOpen}
        onOk={async () => {
          try {
            const values = await mongoCollForm.validateFields();
            setMongoSubmitting(true);
            await api.post(`/software/mongodb/databases/${mongoSelectedDb}/collections`, { name: values.name });
            message.success('Collection created');
            setMongoCreateCollOpen(false);
            mongoCollForm.resetFields();
            if (mongoSelectedDb) fetchMongoCollections(mongoSelectedDb);
            fetchMongoDatabases();
          } catch { message.error('Failed to create collection'); }
          finally { setMongoSubmitting(false); }
        }}
        onCancel={() => { setMongoCreateCollOpen(false); mongoCollForm.resetFields(); }}
        confirmLoading={mongoSubmitting}
        okText="Create"
        cancelText="Cancel"
        destroyOnHidden
        width={420}
      >
        <Form form={mongoCollForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Collection Name" rules={[
            { required: true, message: 'Collection name is required' },
            { pattern: /^[a-zA-Z_][a-zA-Z0-9_.-]*$/, message: 'Invalid collection name' },
          ]}>
            <Input placeholder="my_collection" />
          </Form.Item>
        </Form>
      </Modal>

      {/* MongoDB Create User Modal */}
      <Modal
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><TeamOutlined style={{ color: '#47A248' }} /> Create MongoDB User</span>}
        open={mongoCreateUserOpen}
        onOk={async () => {
          try {
            const values = await mongoUserForm.validateFields();
            setMongoSubmitting(true);
            await api.post('/software/mongodb/users', {
              database: values.database,
              username: values.username,
              password: values.password,
              roles: [values.role || 'readWrite'],
            });
            message.success('User created');
            setMongoCreateUserOpen(false);
            mongoUserForm.resetFields();
            fetchMongoDatabases();
          } catch { message.error('Failed to create user'); }
          finally { setMongoSubmitting(false); }
        }}
        onCancel={() => { setMongoCreateUserOpen(false); mongoUserForm.resetFields(); }}
        confirmLoading={mongoSubmitting}
        okText="Create"
        cancelText="Cancel"
        destroyOnHidden
        width={480}
      >
        <Form form={mongoUserForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="database" label="Database" rules={[{ required: true }]}>
            <Select
              placeholder="Select database"
              options={mongoDatabases.map(d => ({ value: d.name, label: d.name }))}
            />
          </Form.Item>
          <Form.Item name="username" label="Username" rules={[{ required: true }]}>
            <Input placeholder="username" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, min: 6 }]}>
            <Input.Password placeholder="password" />
          </Form.Item>
          <Form.Item name="role" label="Role" initialValue="readWrite">
            <Select options={[
              { value: 'readWrite', label: 'readWrite' },
              { value: 'read', label: 'read (read only)' },
              { value: 'dbAdmin', label: 'dbAdmin' },
              { value: 'dbOwner', label: 'dbOwner' },
              { value: 'userAdmin', label: 'userAdmin' },
              { value: 'clusterAdmin', label: 'clusterAdmin' },
              { value: 'root', label: 'root (superuser)' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default function Databases() {
  const { t } = useTranslation();
  return (
    <RequireSoftware softwareTypes={['database', 'cache']} label={t('databases.title') || 'Database Server (MySQL/MariaDB/PostgreSQL/MongoDB/Redis)'}>
      <DatabasesContent />
    </RequireSoftware>
  );
}
