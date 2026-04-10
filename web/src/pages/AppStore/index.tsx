import { useState, useEffect, useCallback, useRef } from 'react';
import { Modal, message, Select, Input, Spin, Descriptions, Tag, Tabs, Space, Button, Typography } from 'antd';
import {
  ExclamationCircleOutlined, PlayCircleOutlined, PauseCircleOutlined,
  ReloadOutlined, SettingOutlined, FileTextOutlined, DeleteOutlined, LinkOutlined,
  ThunderboltOutlined, RocketOutlined, BankOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePalette } from '@/hooks/usePalette';
import { useTaskStore } from '@/stores/task';
import api from '@/services/api';
import type { ApiResponse, Software } from '@/types';
import NginxManageModal from '@/components/NginxManageModal';
import ApacheManageModal from '@/components/ApacheManageModal';
import PhpMyAdminManageModal from '@/components/PhpMyAdminManageModal';
import PHPManageModal from '@/components/PHPManageModal';
import OLSManageModal from '@/components/OLSManageModal';
import FTPManageModal from '@/components/FTPManageModal';
import MariadbManageModal from '@/components/MariadbManageModal';
import RedisManageModal from '@/components/RedisManageModal';
import FTPStorageManageModal from '@/components/FTPStorageManageModal';
import S3StorageManageModal from '@/components/S3StorageManageModal';
import GoogleDriveManageModal from '@/components/GoogleDriveManageModal';
import OneDriveManageModal from '@/components/OneDriveManageModal';
import { getSoftwareIcon } from './SoftwareIcons';

const { Text } = Typography;

interface AvailableSoftware {
  name: string;
  display_name: string;
  description?: string;
  type: string;
  category?: string;
  versions: string[];
  default_version?: string;
  installed?: boolean;
  installed_versions?: string[];
  multi_version?: boolean;
  icon?: string;
}

const SOFTWARE_COLORS: Record<string, string> = {
  nginx: '#009639', apache: '#D22128', mysql: '#4479A1', mariadb: '#003545',
  postgresql: '#336791', php: '#777BB4', phpmyadmin: '#F89C0E', nodejs: '#339933',
  redis: '#DC382D', memcached: '#3C7E31', python: '#3776AB', docker: '#2496ED',
  mongodb: '#47A248', openlitespeed: '#3A7BD5', pureftpd: '#6C757D',
  ftp_storage: '#1890FF',
  s3_storage: '#FF9900', google_drive: '#4285F4', onedrive: '#0078D4',
};

export default function AppStore() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();
  const [activeTab, setActiveTab] = useState<'installed' | 'available' | 'other' | 'stacks'>('installed');
  const [installed, setInstalled] = useState<Software[]>([]);
  const [available, setAvailable] = useState<AvailableSoftware[]>([]);
  const [installedLoading, setInstalledLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // Install modal
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [installTarget, setInstallTarget] = useState<AvailableSoftware | null>(null);
  const [installVersion, setInstallVersion] = useState<string>('');
  const [installing, setInstalling] = useState(false);

  // Management modal
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [manageSW, setManageSW] = useState<Software | null>(null);
  const [nginxModalOpen, setNginxModalOpen] = useState(false);
  const [pmaModalOpen, setPmaModalOpen] = useState(false);
  const [phpModalOpen, setPhpModalOpen] = useState(false);
  const [olsModalOpen, setOlsModalOpen] = useState(false);
  const [apacheModalOpen, setApacheModalOpen] = useState(false);
  const [ftpModalOpen, setFtpModalOpen] = useState(false);
  const [mariadbModalOpen, setMariadbModalOpen] = useState(false);
  const [redisModalOpen, setRedisModalOpen] = useState(false);
  const [ftpStorageModalOpen, setFtpStorageModalOpen] = useState(false);
  const [s3ModalOpen, setS3ModalOpen] = useState(false);
  const [googleDriveModalOpen, setGoogleDriveModalOpen] = useState(false);
  const [oneDriveModalOpen, setOneDriveModalOpen] = useState(false);
  const [swStatus, setSwStatus] = useState<Record<string, string> | null>(null);
  const [swConfig, setSwConfig] = useState('');
  const [configLoading, setConfigLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [manageTab, setManageTab] = useState<'status' | 'config'>('status');
  const [installedWebServer, setInstalledWebServer] = useState<string>('');
  const [pmaConfig, setPmaConfig] = useState<{ ssl_enabled?: boolean; ssl_port?: number; access_port?: number } | null>(null);

  // Global task store
  const { addTask, setModalOpen: openTaskModal, setActiveTab: setTaskTab } = useTaskStore();
  const tasks = useTaskStore((s) => s.tasks);

  // Stack installer state
  const [stackExtras, setStackExtras] = useState<Record<string, boolean>>({ phpmyadmin: true, pureftpd: false });
  const [stackInstalling, setStackInstalling] = useState<string | null>(null);
  const [stackBatchInstalling, setStackBatchInstalling] = useState<string | null>(null);

  const STACK_DEFS = [
    {
      id: 'lemp', name: 'LEMP Stack',
      desc: 'Linux + Nginx + MySQL + PHP — The modern, high-performance stack for most web apps.',
      components: ['nginx', 'mysql', 'php'],
      color: '#009639',
      icon: <ThunderboltOutlined />,
    },
    {
      id: 'lomp', name: 'LOMP Stack',
      desc: 'Linux + OpenLiteSpeed + MySQL + PHP — Lightweight, fast, built-in cache & GUI.',
      components: ['openlitespeed', 'mysql', 'php'],
      color: '#3A7BD5',
      icon: <RocketOutlined />,
    },
    {
      id: 'lamp', name: 'LAMP Stack',
      desc: 'Linux + Apache + MySQL + PHP — Classic, stable, widely supported stack.',
      components: ['apache', 'mysql', 'php'],
      color: '#D22128',
      icon: <BankOutlined />,
    },
  ] as const;

  const handleStackInstall = async (componentName: string) => {
    const sw = available.find(a => a.name === componentName);
    if (sw) {
      openInstallModal(sw);
    } else {
      // Fallback: install directly without version selection
      setStackInstalling(componentName);
      try {
        const { data } = await api.post<ApiResponse<{ task_id: number }>>('/software/install', {
          name: componentName,
        });
        const taskId = data.data?.task_id;
        if (taskId) {
          trackTask(taskId, `Install ${componentName}`, 'install');
          message.info(`Installing ${componentName}…`);
        }
      } catch {
        message.error(`Failed to install ${componentName}`);
      } finally {
        setStackInstalling(null);
      }
    }
  };

  const handleInstallAllStack = async (stackId: string, components: string[]) => {
    const installedNames = new Set(installed.map(s => s.name));
    const missing = components.filter(c => !installedNames.has(c));
    if (missing.length === 0) {
      message.info('All components are already installed');
      return;
    }
    setStackBatchInstalling(stackId);
    try {
      const { data } = await api.post<ApiResponse<{ task_id: number }>>('/software/install-stack', {
        components: missing,
      });
      const taskId = data.data?.task_id;
      if (taskId) {
        addTask({
          id: taskId,
          name: JSON.stringify(missing),
          type: 'stack_install',
          status: 'running',
          progress: 0,
          created_at: new Date().toISOString(),
        });
        openTaskModal(true);
        setTaskTab('tasks');
      }
    } catch {
      message.error('Failed to start stack installation');
    } finally {
      setStackBatchInstalling(null);
    }
  };

  /* ───────── Data fetching ───────── */

  const fetchInstalled = useCallback(async () => {
    setInstalledLoading(true);
    try {
      const { data } = await api.get<ApiResponse<{ installed: Software[]; available: AvailableSoftware[] }>>('/software');
      setInstalled(data.data?.installed ?? []);
      setAvailable(data.data?.available ?? []);
      // Fetch which web server is installed for conflict check
      try {
        const { data: wsData } = await api.get('/software/webserver-check');
        setInstalledWebServer(wsData.data?.installed_webserver ?? '');
      } catch { /* ignore */ }
      // Fetch phpMyAdmin config for SSL-aware links
      try {
        const { data: cfgResp } = await api.get('/software/phpmyadmin/manager');
        setPmaConfig(cfgResp.data || null);
      } catch { /* ignore */ }
    } catch {
      message.error('Failed to load software');
    } finally {
      setInstalledLoading(false);
    }
  }, []);

  useEffect(() => { fetchInstalled(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const prevCompletedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const completedIds = new Set<number>();
    for (const task of Object.values(tasks)) {
      if (
        (task.type === 'software_install' || task.type === 'software_uninstall') &&
        (task.status === 'completed' || task.status === 'failed')
      ) {
        completedIds.add(task.id);
      }
    }
    const prev = prevCompletedRef.current;
    let hasNew = false;
    for (const id of completedIds) { if (!prev.has(id)) { hasNew = true; break; } }
    prevCompletedRef.current = completedIds;
    if (hasNew) fetchInstalled();
  }, [tasks, fetchInstalled]);

  /* ───────── Task tracking ───────── */

  const trackTask = useCallback(
    (taskId: number, name: string, type: 'install' | 'uninstall') => {
      addTask({
        id: taskId, name,
        type: type === 'install' ? 'software_install' : 'software_uninstall',
        status: 'running', progress: 0, created_at: new Date().toISOString(),
      });
      openTaskModal(true);
      setTaskTab('tasks');
    },
    [addTask, openTaskModal, setTaskTab],
  );

  /* ───────── Service actions ───────── */

  const handleServiceAction = async (name: string, action: 'start' | 'stop' | 'restart') => {
    if (action === 'stop') {
      Modal.confirm({
        title: `Stop ${name}?`,
        icon: <ExclamationCircleOutlined />,
        content: 'This will stop the service. Active connections may be interrupted.',
        onOk: () => doServiceAction(name, action),
      });
      return;
    }
    await doServiceAction(name, action);
  };

  const doServiceAction = async (name: string, action: string) => {
    setActionLoading((prev) => ({ ...prev, [name]: true }));
    try {
      await api.post(`/software/${name}/${action}`);
      message.success(`${name}: ${action} successful`);
      fetchInstalled();
    } catch {
      message.error(`${name}: ${action} failed`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [name]: false }));
    }
  };

  /* ───────── Install / Uninstall ───────── */

  const openInstallModal = (sw: AvailableSoftware) => {
    setInstallTarget(sw);
    // For multi-version software, filter out already installed versions
    const availableVersions = sw.multi_version
      ? sw.versions.filter(v => !(sw.installed_versions ?? []).includes(v))
      : sw.versions;
    // Use backend-provided default (first = recommended), fall back to first available
    const defaultVer = sw.default_version && availableVersions.includes(sw.default_version)
      ? sw.default_version
      : (availableVersions[0] ?? '');
    setInstallVersion(defaultVer);
    setInstallModalOpen(true);
  };

  const handleInstall = async () => {
    if (!installTarget) return;
    setInstalling(true);
    try {
      const { data } = await api.post<ApiResponse<{ task_id: number }>>('/software/install', {
        name: installTarget.name, version: installVersion,
      });
      const taskId = data.data?.task_id;
      if (taskId) {
        trackTask(taskId, `Install ${installTarget.display_name}`, 'install');
        setInstallModalOpen(false);
        message.info(`Installation of ${installTarget.display_name} started`);
      } else {
        message.success(`${installTarget.display_name} installed`);
        setInstallModalOpen(false);
        fetchInstalled();
      }
    } catch {
      message.error(t('common.error'));
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstall = useCallback(
    (sw: Software | { name: string; display_name: string }, version?: string) => {
      const label = version ? `${sw.display_name} ${version}` : sw.display_name;
      const content = version
        ? `This will remove PHP ${version} and its packages. Other PHP versions will not be affected.`
        : `This will completely remove ${sw.display_name} and all its configuration. This action cannot be undone.`;
      Modal.confirm({
        title: `Uninstall ${label}?`,
        icon: <ExclamationCircleOutlined />,
        content,
        okText: 'Uninstall',
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            const url = version
              ? `/software/${sw.name}?version=${version}`
              : `/software/${sw.name}`;
            const { data } = await api.delete<ApiResponse<{ task_id: number }>>(url);
            const taskId = data.data?.task_id;
            if (taskId) {
              trackTask(taskId, `Uninstall ${label}`, 'uninstall');
              message.info(`Uninstalling ${label}…`);
              setManageModalOpen(false);
            } else {
              message.success(`${label} uninstalled`);
              fetchInstalled();
            }
          } catch {
            message.error(`Failed to uninstall ${label}`);
          }
        },
      });
    },
    [trackTask, fetchInstalled],
  );

  /* ───────── Management modal ───────── */

  const openManageModal = async (sw: Software) => {
    if (sw.name === 'nginx') { setNginxModalOpen(true); return; }
    if (sw.name === 'apache') { setApacheModalOpen(true); return; }
    if (sw.name === 'openlitespeed') { setOlsModalOpen(true); return; }
    if (sw.name === 'phpmyadmin') { setPmaModalOpen(true); return; }
    if (sw.name === 'php') { setPhpModalOpen(true); return; }
    if (sw.name === 'pureftpd') { setFtpModalOpen(true); return; }
    if (sw.name === 'mysql') { setMariadbModalOpen(true); return; }
    if (sw.name === 'redis') { setRedisModalOpen(true); return; }
    if (sw.name === 'ftp_storage') { setFtpStorageModalOpen(true); return; }
    if (sw.name === 's3_storage') { setS3ModalOpen(true); return; }
    if (sw.name === 'google_drive') { setGoogleDriveModalOpen(true); return; }
    if (sw.name === 'onedrive') { setOneDriveModalOpen(true); return; }
    setManageSW(sw);
    setManageTab('status');
    setSwStatus(null);
    setSwConfig('');
    setManageModalOpen(true);
    try {
      const { data } = await api.get(`/software/${sw.name}/status`);
      setSwStatus(data.data);
    } catch {
      setSwStatus({ error: 'Could not fetch status' });
    }
  };

  const fetchConfig = async () => {
    if (!manageSW) return;
    setConfigLoading(true);
    try {
      const { data } = await api.get(`/software/${manageSW.name}/config`);
      setSwConfig(data.data?.content ?? '');
    } catch {
      setSwConfig('# Config file not found or not supported for this software');
    } finally {
      setConfigLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!manageSW) return;
    setSavingConfig(true);
    try {
      await api.put(`/software/${manageSW.name}/config`, { content: swConfig });
      message.success('Configuration saved. Restart the service to apply changes.');
    } catch {
      message.error('Failed to save configuration');
    } finally {
      setSavingConfig(false);
    }
  };

  /* ───────── Helpers ───────── */

  const isInstalled = (name: string) => installed.some((s) => s.name === name);
  const WEB_SERVERS = ['nginx', 'apache', 'openlitespeed'];
  const isWebServerBlocked = (name: string) =>
    WEB_SERVERS.includes(name) && installedWebServer && installedWebServer !== name;
  const runningCount = installed.filter(s => s.status === 1).length;

  const otherSoftware = available.filter(sw => sw.type === 'tool' || sw.type === 'storage');
  const mainSoftware = available.filter(sw => sw.type !== 'tool' && sw.type !== 'storage');

  const actionBtn = (color: string, disabled?: boolean, busy?: boolean): React.CSSProperties => ({
    padding: '4px 10px', borderRadius: 5,
    border: `1px solid ${disabled ? p.cardBorder : color}`,
    background: 'transparent',
    color: disabled ? p.textDim : color,
    fontSize: 11, fontWeight: 500,
    cursor: disabled || busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.5 : 1,
    transition: 'all 0.15s',
    display: 'inline-flex', alignItems: 'center', gap: 4,
    lineHeight: 1.3,
  });

  /* ═══════════════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════════════ */

  return (
    <div style={{
      background: p.card, borderRadius: 12,
      border: `1px solid ${p.cardBorder}`,
      boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>

      {/* ── Header bar ─────────────────────────────────────────────────── */}
      <div style={{
        padding: '14px 20px',
        borderBottom: `1px solid ${p.cardBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: p.headerBg,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: p.text, letterSpacing: '-0.01em' }}>
            App Store
          </span>
          <span style={{
            fontSize: 11, padding: '2px 9px', borderRadius: 4,
            background: `${p.accent}15`, color: p.accent, fontWeight: 500,
          }}>
            {installed.length} installed
          </span>
          {runningCount > 0 && (
            <span style={{
              fontSize: 11, padding: '2px 9px', borderRadius: 4,
              background: `${p.green}15`, color: p.green, fontWeight: 500,
            }}>
              {runningCount} running
            </span>
          )}
        </div>
        <button
          onClick={() => fetchInstalled()}
          style={{
            padding: '5px 14px', borderRadius: 6,
            border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted,
            fontSize: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = p.accent; e.currentTarget.style.color = p.accent; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = p.cardBorder; e.currentTarget.style.color = p.textMuted; }}
        >
          <ReloadOutlined style={{ fontSize: 12 }} /> Refresh
        </button>
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────────── */}
      <div style={{
        padding: '8px 20px',
        borderBottom: `1px solid ${p.cardBorder}`,
        display: 'flex', gap: 4,
      }}>
        {([
          { key: 'installed' as const, label: `Installed (${installed.length})` },
          { key: 'available' as const, label: `Available (${mainSoftware.length})` },
          { key: 'other' as const, label: `Other Software (${otherSoftware.length})` },
          { key: 'stacks' as const, label: 'Stacks' },
        ]).map(tab => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '6px 16px', borderRadius: 6,
                border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 500,
                background: active ? `${p.accent}15` : 'transparent',
                color: active ? p.accent : p.textMuted,
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div style={{ padding: 16, minHeight: 200 }}>
        {installedLoading ? (
          <div style={{ textAlign: 'center', padding: 48, color: p.textMuted, fontSize: 13 }}>
            <div style={{
              width: 24, height: 24, border: `2px solid ${p.cardBorder}`,
              borderTopColor: p.accent, borderRadius: '50%',
              margin: '0 auto 12px',
              animation: 'spin 0.8s linear infinite',
            }} />
            Loading software…
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : activeTab === 'installed' ? (
          /* ── INSTALLED TAB ── */
          installed.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: p.textMuted, fontSize: 13 }}>
              No software installed yet. Switch to Available to get started.
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '100%' : '320px'}, 1fr))`,
              gap: 10,
            }}>
              {installed.map(sw => {
                const running = sw.status === 1;
                const busy = !!actionLoading[sw.name];
                return (
                  <div
                    key={sw.name}
                    style={{
                      padding: 16, borderRadius: 10,
                      border: `1px solid ${p.cardBorder}`,
                      background: isDark ? p.rowAlt : p.card,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onClick={() => openManageModal(sw)}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = `${p.accent}60`; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = p.cardBorder; }}
                  >
                    {/* Row 1: icon + name + status */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      {getSoftwareIcon(sw.name)}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: p.text, fontSize: 14 }}>
                          {sw.display_name}
                        </div>
                        <div style={{ fontSize: 11, color: p.textMuted }}>
                          v{sw.version} · {sw.type}
                        </div>
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '3px 10px', borderRadius: 99,
                        background: running ? `${p.green}15` : `${p.red}15`,
                        fontSize: 11, fontWeight: 500,
                        color: running ? p.green : p.red,
                      }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: 3, display: 'inline-block',
                          background: running ? p.green : p.red,
                        }} />
                        {running ? 'Running' : 'Stopped'}
                      </div>
                    </div>

                    {/* Row 2: action buttons */}
                    <div
                      style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        style={actionBtn(p.green, running, busy)}
                        disabled={running || busy}
                        onClick={() => handleServiceAction(sw.name, 'start')}
                      ><PlayCircleOutlined style={{ fontSize: 10 }} /> Start</button>
                      <button
                        style={actionBtn(p.red, !running, busy)}
                        disabled={!running || busy}
                        onClick={() => handleServiceAction(sw.name, 'stop')}
                      ><PauseCircleOutlined style={{ fontSize: 10 }} /> Stop</button>
                      <button
                        style={actionBtn(p.accent, false, busy)}
                        disabled={busy}
                        onClick={() => handleServiceAction(sw.name, 'restart')}
                      ><ReloadOutlined style={{ fontSize: 10 }} /> Restart</button>
                      {(() => {
                        const avail = available.find(a => a.name === sw.name);
                        const versions = avail?.installed_versions ?? [];
                        if (avail?.multi_version && versions.length > 1) {
                          return (
                            <select
                              style={{
                                marginLeft: 'auto',
                                padding: '4px 6px', borderRadius: 6,
                                border: `1px solid ${p.red}50`,
                                background: 'transparent', color: p.red,
                                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                outline: 'none',
                              }}
                              defaultValue=""
                              onChange={e => {
                                const val = e.target.value;
                                e.target.value = '';
                                if (val === '__all__') handleUninstall(sw);
                                else if (val) handleUninstall(sw, val);
                              }}
                            >
                              <option value="" disabled>× Remove…</option>
                              {versions.map(v => (
                                <option key={v} value={v}>PHP {v}</option>
                              ))}
                              <option value="__all__">All versions</option>
                            </select>
                          );
                        }
                        return (
                          <button
                            style={{ ...actionBtn(p.red), marginLeft: 'auto' }}
                            onClick={() => handleUninstall(sw)}
                          >× Remove</button>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : activeTab === 'available' ? (
          /* ── AVAILABLE TAB ── */
          mainSoftware.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: p.textMuted, fontSize: 13 }}>
              No additional software available.
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '100%' : '260px'}, 1fr))`,
              gap: 10,
            }}>
              {mainSoftware.map(sw => {
                const done = isInstalled(sw.name);
                const blocked = isWebServerBlocked(sw.name);
                const wsName = installed.find(s => s.name === installedWebServer)?.display_name || installedWebServer;
                return (
                  <div
                    key={sw.name}
                    style={{
                      padding: 16, borderRadius: 10,
                      border: `1px solid ${p.cardBorder}`,
                      background: isDark ? p.rowAlt : p.card,
                      transition: 'all 0.15s',
                      opacity: (done && !sw.multi_version) || blocked ? 0.6 : 1,
                      display: 'flex', flexDirection: 'column',
                    }}
                    onMouseEnter={e => { if ((!done || sw.multi_version) && !blocked) e.currentTarget.style.borderColor = `${p.accent}60`; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = p.cardBorder; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      {getSoftwareIcon(sw.name)}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: p.text, fontSize: 14 }}>
                          {sw.display_name}
                        </div>
                        <span style={{
                          fontSize: 10, padding: '2px 7px', borderRadius: 4,
                          background: `${p.accent}12`, color: p.accent,
                          fontWeight: 500,
                        }}>
                          {sw.type || sw.category}
                        </span>
                      </div>
                    </div>

                    <div style={{
                      fontSize: 12, color: p.textMuted, marginBottom: 14,
                      lineHeight: 1.5, flex: 1,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                      overflow: 'hidden',
                    }}>
                      {sw.description || `${sw.display_name} — ${sw.type || sw.category || 'software'}`}
                    </div>

                    {done ? (
                      sw.multi_version ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap',
                            fontSize: 12, fontWeight: 500, color: p.green,
                          }}>
                            <span style={{
                              width: 6, height: 6, borderRadius: 3,
                              background: p.green, display: 'inline-block',
                            }} />
                            {(sw.installed_versions ?? []).map(v => (
                              <span
                                key={v}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  padding: '1px 8px', borderRadius: 4,
                                  background: `${p.green}15`, fontSize: 11,
                                }}
                              >
                                {v}
                                <span
                                  style={{ cursor: 'pointer', color: p.red, fontWeight: 700, fontSize: 13, lineHeight: 1 }}
                                  title={`Remove PHP ${v}`}
                                  onClick={e => { e.stopPropagation(); handleUninstall({ name: sw.name, display_name: sw.display_name }, v); }}
                                >×</span>
                              </span>
                            ))}
                          </div>
                          {(sw.versions.filter(v => !(sw.installed_versions ?? []).includes(v)).length > 0) && (
                            <button
                              onClick={() => openInstallModal(sw)}
                              style={{
                                width: '100%', padding: '6px 0',
                                borderRadius: 7, border: `1px solid ${p.accent}`,
                                background: 'transparent', color: p.accent,
                                fontSize: 12, fontWeight: 500,
                                cursor: 'pointer', transition: 'opacity 0.15s',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = `${p.accent}10`; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >
                              + Add Version
                            </button>
                          )}
                        </div>
                      ) : (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        fontSize: 12, fontWeight: 500, color: p.green,
                        padding: '6px 0',
                      }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: 3,
                          background: p.green, display: 'inline-block',
                        }} />
                        Installed
                      </div>
                      )
                    ) : blocked ? (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        fontSize: 11, fontWeight: 500, color: p.amber || p.textMuted,
                        padding: '6px 0',
                      }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: 3,
                          background: p.amber || p.textMuted, display: 'inline-block',
                        }} />
                        {wsName} is installed — uninstall it first
                      </div>
                    ) : (
                      <button
                        onClick={() => openInstallModal(sw)}
                        style={{
                          width: '100%', padding: '8px 0',
                          borderRadius: 7, border: 'none',
                          background: p.accent, color: '#fff',
                          fontSize: 13, fontWeight: 500,
                          cursor: 'pointer', transition: 'opacity 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                      >
                        Install
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : activeTab === 'other' ? (
          /* ── OTHER SOFTWARE TAB ── */
          otherSoftware.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: p.textMuted, fontSize: 13 }}>
              No other software available.
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '100%' : '260px'}, 1fr))`,
              gap: 10,
            }}>
              {otherSoftware.map(sw => {
                const done = isInstalled(sw.name);
                const blocked = isWebServerBlocked(sw.name);
                const wsName = installed.find(s => s.name === installedWebServer)?.display_name || installedWebServer;
                return (
                  <div
                    key={sw.name}
                    style={{
                      padding: 16, borderRadius: 10,
                      border: `1px solid ${p.cardBorder}`,
                      background: isDark ? p.rowAlt : p.card,
                      transition: 'all 0.15s',
                      opacity: (done && !sw.multi_version) || blocked ? 0.6 : 1,
                      display: 'flex', flexDirection: 'column',
                    }}
                    onMouseEnter={e => { if ((!done || sw.multi_version) && !blocked) e.currentTarget.style.borderColor = `${p.accent}60`; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = p.cardBorder; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      {getSoftwareIcon(sw.name)}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: p.text, fontSize: 14 }}>
                          {sw.display_name}
                        </div>
                        <span style={{
                          fontSize: 10, padding: '2px 7px', borderRadius: 4,
                          background: `${p.accent}12`, color: p.accent,
                          fontWeight: 500,
                        }}>
                          {sw.type || sw.category}
                        </span>
                      </div>
                    </div>

                    <div style={{
                      fontSize: 12, color: p.textMuted, marginBottom: 14,
                      lineHeight: 1.5, flex: 1,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                      overflow: 'hidden',
                    }}>
                      {sw.description || `${sw.display_name} — ${sw.type || sw.category || 'software'}`}
                    </div>

                    {done ? (
                      sw.multi_version ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap',
                            fontSize: 12, fontWeight: 500, color: p.green,
                          }}>
                            <span style={{
                              width: 6, height: 6, borderRadius: 3,
                              background: p.green, display: 'inline-block',
                            }} />
                            {(sw.installed_versions ?? []).map(v => (
                              <span
                                key={v}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  padding: '1px 8px', borderRadius: 4,
                                  background: `${p.green}15`, fontSize: 11,
                                }}
                              >
                                {v}
                                <span
                                  style={{ cursor: 'pointer', color: p.red, fontWeight: 700, fontSize: 13, lineHeight: 1 }}
                                  title={`Remove ${sw.display_name} ${v}`}
                                  onClick={e => { e.stopPropagation(); handleUninstall({ name: sw.name, display_name: sw.display_name }, v); }}
                                >×</span>
                              </span>
                            ))}
                          </div>
                          {(sw.versions.filter(v => !(sw.installed_versions ?? []).includes(v)).length > 0) && (
                            <button
                              onClick={() => openInstallModal(sw)}
                              style={{
                                width: '100%', padding: '6px 0',
                                borderRadius: 7, border: `1px solid ${p.accent}`,
                                background: 'transparent', color: p.accent,
                                fontSize: 12, fontWeight: 500,
                                cursor: 'pointer', transition: 'opacity 0.15s',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = `${p.accent}10`; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >
                              + Add Version
                            </button>
                          )}
                        </div>
                      ) : (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        fontSize: 12, fontWeight: 500, color: p.green,
                        padding: '6px 0',
                      }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: 3,
                          background: p.green, display: 'inline-block',
                        }} />
                        Installed
                      </div>
                      )
                    ) : blocked ? (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        fontSize: 11, fontWeight: 500, color: p.amber || p.textMuted,
                        padding: '6px 0',
                      }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: 3,
                          background: p.amber || p.textMuted, display: 'inline-block',
                        }} />
                        {wsName} is installed — uninstall it first
                      </div>
                    ) : (
                      <button
                        onClick={() => openInstallModal(sw)}
                        style={{
                          width: '100%', padding: '8px 0',
                          borderRadius: 7, border: 'none',
                          background: p.accent, color: '#fff',
                          fontSize: 13, fontWeight: 500,
                          cursor: 'pointer', transition: 'opacity 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                      >
                        Install
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : activeTab === 'stacks' ? (
          /* ── STACKS TAB ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 13, color: p.textMuted, lineHeight: 1.6 }}>
              Select a server stack to install all required components at once. You can also include optional extras like phpMyAdmin or FTP.
            </div>

            {/* ── Extras toggle ── */}
            <div style={{
              display: 'flex', gap: 12, flexWrap: 'wrap',
              padding: '12px 16px', borderRadius: 8,
              background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
              border: `1px solid ${p.cardBorder}`,
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: p.text, marginRight: 4, alignSelf: 'center' }}>
                Extras:
              </span>
              {([
                { key: 'phpmyadmin', label: 'phpMyAdmin', desc: 'Web database manager' },
                { key: 'pureftpd', label: 'Pure-FTPd', desc: 'FTP server' },
              ] as const).map(extra => {
                const on = stackExtras[extra.key];
                return (
                  <button
                    key={extra.key}
                    onClick={() => setStackExtras(prev => ({ ...prev, [extra.key]: !prev[extra.key] }))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 14px', borderRadius: 6,
                      border: `1px solid ${on ? p.accent : p.cardBorder}`,
                      background: on ? `${p.accent}15` : 'transparent',
                      cursor: 'pointer', transition: 'all 0.15s',
                      fontSize: 12, color: on ? p.accent : p.textMuted,
                    }}
                  >
                    <span style={{
                      width: 16, height: 16, borderRadius: 4,
                      border: `2px solid ${on ? p.accent : p.textMuted}`,
                      background: on ? p.accent : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, transition: 'all 0.15s',
                    }}>
                      {on && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                    </span>
                    <span>
                      <span style={{ fontWeight: 500 }}>{extra.label}</span>
                      <span style={{ color: p.textMuted, marginLeft: 6 }}>— {extra.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* ── Stack cards ── */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '100%' : '300px'}, 1fr))`,
              gap: 14,
            }}>
              {STACK_DEFS.map(stack => {
                const installedNames = new Set(installed.map(s => s.name));
                const allComponents = [...stack.components] as string[];
                if (stackExtras.phpmyadmin) allComponents.push('phpmyadmin');
                if (stackExtras.pureftpd) allComponents.push('pureftpd');
                const remaining = allComponents.filter(c => !installedNames.has(c));
                const allDone = remaining.length === 0;

                return (
                  <div
                    key={stack.id}
                    style={{
                      padding: 20, borderRadius: 10,
                      border: `1px solid ${p.cardBorder}`,
                      background: isDark ? 'rgba(255,255,255,0.02)' : '#fff',
                      display: 'flex', flexDirection: 'column', gap: 14,
                      transition: 'box-shadow 0.2s, border-color 0.2s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = stack.color;
                      e.currentTarget.style.boxShadow = `0 4px 20px ${stack.color}18`;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = p.cardBorder;
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 10,
                        background: `${stack.color}15`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 22,
                      }}>
                        {stack.icon}
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: p.text }}>{stack.name}</div>
                        <div style={{ fontSize: 11, color: p.textMuted }}>
                          {allDone ? 'All installed' : `${remaining.length} of ${allComponents.length} remaining`}
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    <div style={{ fontSize: 12, color: p.textMuted, lineHeight: 1.5 }}>{stack.desc}</div>

                    {/* Component list with individual install buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {allComponents.map(comp => {
                        const done = installedNames.has(comp);
                        const blocked = isWebServerBlocked(comp);
                        const color = SOFTWARE_COLORS[comp] || '#666';
                        const isBusy = stackInstalling === comp;
                        return (
                          <div key={comp} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '8px 12px', borderRadius: 7,
                            background: done ? `${p.green}08` : isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.015)',
                            border: `1px solid ${done ? `${p.green}20` : p.cardBorder}`,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{
                                width: 26, height: 26, borderRadius: 6,
                                overflow: 'hidden',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <div style={{ transform: 'scale(0.8)', transformOrigin: 'center' }}>
                                  {getSoftwareIcon(comp)}
                                </div>
                              </div>
                              <span style={{ fontSize: 13, fontWeight: 500, color: p.text }}>{comp}</span>
                            </div>
                            {done ? (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontSize: 11, fontWeight: 600, color: p.green,
                                padding: '3px 10px', borderRadius: 5,
                                background: `${p.green}12`,
                              }}>✓ Installed</span>
                            ) : blocked ? (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontSize: 11, fontWeight: 500, color: p.amber || p.textMuted,
                                padding: '3px 10px', borderRadius: 5,
                                background: `${(p.amber || p.textMuted)}12`,
                              }}>⚠ Conflict</span>
                            ) : (
                              <button
                                disabled={isBusy}
                                onClick={() => handleStackInstall(comp)}
                                style={{
                                  padding: '4px 14px', borderRadius: 6,
                                  border: `1px solid ${color}60`,
                                  background: 'transparent',
                                  color: color,
                                  fontSize: 11, fontWeight: 600,
                                  cursor: isBusy ? 'not-allowed' : 'pointer',
                                  opacity: isBusy ? 0.6 : 1,
                                  transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => { if (!isBusy) { e.currentTarget.style.background = `${color}12`; } }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                              >
                                {isBusy ? 'Installing…' : 'Install'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Install All button */}
                    {!allDone && remaining.length > 0 && (
                      <button
                        disabled={stackBatchInstalling === stack.id}
                        onClick={() => handleInstallAllStack(stack.id, allComponents)}
                        style={{
                          width: '100%', padding: '10px 0',
                          borderRadius: 8, border: 'none',
                          background: stackBatchInstalling === stack.id ? `${stack.color}80` : stack.color,
                          color: '#fff',
                          fontSize: 13, fontWeight: 600,
                          cursor: stackBatchInstalling === stack.id ? 'not-allowed' : 'pointer',
                          transition: 'opacity 0.15s',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                        onMouseEnter={e => { if (stackBatchInstalling !== stack.id) e.currentTarget.style.opacity = '0.85'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                      >
                        {stackBatchInstalling === stack.id
                          ? <><ReloadOutlined spin style={{ fontSize: 11 }} /> Installing…</>
                          : <><PlayCircleOutlined style={{ fontSize: 11 }} /> Install All ({remaining.length} remaining)</>
                        }
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Install Modal ──────────────────────────────────────────────── */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {installTarget && getSoftwareIcon(installTarget.name)}
            <span>Install {installTarget?.display_name}</span>
          </div>
        }
        open={installModalOpen}
        onCancel={() => { if (!installing) setInstallModalOpen(false); }}
        footer={[
          <Button key="cancel" disabled={installing} onClick={() => setInstallModalOpen(false)}>
            {t('common.cancel')}
          </Button>,
          <Button key="install" type="primary" loading={installing} onClick={handleInstall}>
            {t('common.install')}
          </Button>,
        ]}
        closable={!installing}
        maskClosable={!installing}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ color: p.textMuted, margin: 0, fontSize: 13 }}>
            {installTarget?.description}
          </p>
          <div>
            <div style={{ fontWeight: 500, marginBottom: 6, fontSize: 13 }}>Select Version</div>
            <Select
              value={installVersion}
              onChange={setInstallVersion}
              style={{ width: '100%' }}
              options={(() => {
                const versions = installTarget?.versions ?? [];
                const installedVers = installTarget?.installed_versions ?? [];
                const defaultVer = installTarget?.default_version;
                const isNginx = installTarget?.name === 'nginx';
                const isMySQL = installTarget?.name === 'mysql';
                const isPHP = installTarget?.name === 'php';
                const isRedis = installTarget?.name === 'redis';
                const swName = installTarget?.name ?? '';

                const mysqlLabels: Record<string, string> = {
                  'mariadb-11.4': 'MariaDB 11.4 LTS (2024–2029)',
                  'mariadb-11.6': 'MariaDB 11.6 (Latest Stable)',
                  'mariadb-10.11': 'MariaDB 10.11 LTS (2023–2028)',
                  'mariadb-10.6': 'MariaDB 10.6 LTS (2021–2026)',
                  'mysql-8.4': 'MySQL 8.4 LTS (2024–2032)',
                  'mysql-8.0': 'MySQL 8.0 LTS (2018–2026)',
                  'mysql-9.0': 'MySQL 9.0 Innovation (Short-term)',
                };

                const phpLabels: Record<string, string> = {
                  '8.4': 'PHP 8.4 — Active Support',
                  '8.3': 'PHP 8.3 — Active Support',
                  '8.2': 'PHP 8.2 — Security Fixes Only',
                  '8.1': 'PHP 8.1 — Security Fixes Only',
                  '8.0': 'PHP 8.0 — EOL (Legacy)',
                  '7.4': 'PHP 7.4 — EOL (Legacy)',
                };

                const redisLabels: Record<string, string> = {
                  '7.4': 'Redis 7.4 — Latest Stable',
                  '7.2': 'Redis 7.2 LTS (2024–2028)',
                  '6.2': 'Redis 6.2 — EOL (Legacy)',
                };

                const singleVersionLabels: Record<string, Record<string, string>> = {
                  apache: { '2.4': 'Apache 2.4 (Current Stable)' },
                  openlitespeed: { stable: 'OpenLiteSpeed (Latest Stable)' },
                  pureftpd: { stable: 'Pure-FTPd (Latest Stable)' },
                  ftp_storage: { stable: 'FTP Storage (lftp)' },
                  docker: { stable: 'Docker CE (Latest Stable)' },
                };

                return versions.map((v) => {
                  let label = `v${v}`;
                  if (isNginx) {
                    if (v === 'stable') label = 'Stable (Latest Stable Release)';
                    else if (v === 'mainline') label = 'Mainline (Latest Development)';
                    else {
                      const minor = parseInt(v.split('.')[1] ?? '0', 10);
                      label = `v${v} ${minor % 2 === 0 ? '(Stable Branch)' : '(Mainline Branch)'}`;
                    }
                  } else if (isMySQL) {
                    label = mysqlLabels[v] || v;
                  } else if (isPHP) {
                    label = phpLabels[v] || `PHP ${v}`;
                  } else if (isRedis) {
                    label = redisLabels[v] || `Redis ${v}`;
                  } else if (singleVersionLabels[swName]?.[v]) {
                    label = singleVersionLabels[swName][v];
                  }
                  if (v === defaultVer && !installedVers.includes(v)) label += ' ★';
                  if (installedVers.includes(v)) label += ' (Installed)';
                  return { value: v, label, disabled: installedVers.includes(v) };
                });
              })()}
            />
          </div>
        </div>
      </Modal>

      {/* ── Management Modal ───────────────────────────────────────────── */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {manageSW && getSoftwareIcon(manageSW.name)}
            <span>{manageSW?.display_name} Management</span>
          </div>
        }
        open={manageModalOpen}
        onCancel={() => setManageModalOpen(false)}
        width={isMobile ? '95%' : 700}
        footer={null}
      >
        {manageSW && (
          <Tabs
            activeKey={manageTab}
            onChange={(key) => {
              setManageTab(key as 'status' | 'config');
              if (key === 'config' && !swConfig) fetchConfig();
            }}
            items={[
              {
                key: 'status',
                label: <span><SettingOutlined /> Status</span>,
                children: (
                  <div>
                    <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
                      <Descriptions.Item label="Name">{manageSW.display_name}</Descriptions.Item>
                      <Descriptions.Item label="Version">
                        <span style={{  }}>{manageSW.version}</span>
                      </Descriptions.Item>
                      <Descriptions.Item label="Type"><Tag>{manageSW.type}</Tag></Descriptions.Item>
                      <Descriptions.Item label="Status">
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontWeight: 500, fontSize: 13,
                          color: manageSW.status === 1 ? p.green : p.red,
                        }}>
                          <span style={{
                            width: 7, height: 7, borderRadius: 4,
                            background: manageSW.status === 1 ? p.green : p.red,
                            display: 'inline-block',
                          }} />
                          {manageSW.status === 1 ? 'Running' : 'Stopped'}
                        </span>
                      </Descriptions.Item>
                      {swStatus && !swStatus.error && (
                        <>
                          {swStatus.ActiveState && (
                            <Descriptions.Item label="Active State">
                              <Tag color={swStatus.ActiveState === 'active' ? 'success' : 'default'}>{swStatus.ActiveState}</Tag>
                            </Descriptions.Item>
                          )}
                          {swStatus.SubState && <Descriptions.Item label="Sub State">{swStatus.SubState}</Descriptions.Item>}
                          {swStatus.MainPID && swStatus.MainPID !== '0' && (
                            <Descriptions.Item label="Main PID">
                              <span style={{  }}>{swStatus.MainPID}</span>
                            </Descriptions.Item>
                          )}
                          {swStatus.MemoryCurrent && swStatus.MemoryCurrent !== '18446744073709551615' && (
                            <Descriptions.Item label="Memory">
                              <span style={{  }}>
                                {(parseInt(swStatus.MemoryCurrent) / 1024 / 1024).toFixed(1)} MB
                              </span>
                            </Descriptions.Item>
                          )}
                          {swStatus.ActiveEnterTimestamp && (
                            <Descriptions.Item label="Started">{swStatus.ActiveEnterTimestamp}</Descriptions.Item>
                          )}
                        </>
                      )}
                      {swStatus?.error && (
                        <Descriptions.Item label="Error">
                          <Text type="danger">{swStatus.error}</Text>
                        </Descriptions.Item>
                      )}
                    </Descriptions>
                    <Space wrap>
                      {manageSW.name === 'phpmyadmin' && (
                        <Button
                          type="primary"
                          icon={<LinkOutlined />}
                          onClick={() => {
                            const host = window.location.hostname;
                            const proto = pmaConfig?.ssl_enabled ? 'https' : 'http';
                            const port = pmaConfig?.ssl_enabled ? (pmaConfig?.ssl_port || 887) : (pmaConfig?.access_port || 888);
                            window.open(`${proto}://${host}:${port}/`, '_blank');
                          }}
                          style={{ background: p.accent, borderColor: p.accent }}
                        >
                          Open phpMyAdmin
                        </Button>
                      )}
                      <Button
                        type="primary" ghost
                        icon={<PlayCircleOutlined />}
                        loading={actionLoading[manageSW.name]}
                        disabled={manageSW.status === 1}
                        onClick={async () => {
                          await doServiceAction(manageSW.name, 'start');
                          openManageModal({ ...manageSW, status: 1 });
                        }}
                      >{t('common.start')}</Button>
                      <Button
                        danger ghost
                        icon={<PauseCircleOutlined />}
                        loading={actionLoading[manageSW.name]}
                        disabled={manageSW.status !== 1}
                        onClick={async () => {
                          await doServiceAction(manageSW.name, 'stop');
                          openManageModal({ ...manageSW, status: 0 });
                        }}
                      >{t('common.stop')}</Button>
                      <Button
                        icon={<ReloadOutlined />}
                        loading={actionLoading[manageSW.name]}
                        onClick={async () => {
                          await doServiceAction(manageSW.name, 'restart');
                          openManageModal({ ...manageSW, status: 1 });
                        }}
                      >{t('common.restart')}</Button>
                      <Button
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => {
                          const avail = available.find(a => a.name === manageSW.name);
                          const versions = avail?.installed_versions ?? [];
                          if (avail?.multi_version && versions.length > 1) {
                            Modal.confirm({
                              title: `Uninstall ${manageSW.display_name}`,
                              icon: <ExclamationCircleOutlined />,
                              content: (
                                <div>
                                  <p style={{ marginBottom: 12 }}>Select which version(s) to remove:</p>
                                  <Space direction="vertical" style={{ width: '100%' }}>
                                    {versions.map(v => (
                                      <Button
                                        key={v}
                                        danger
                                        block
                                        onClick={() => {
                                          Modal.destroyAll();
                                          handleUninstall(manageSW, v);
                                        }}
                                      >
                                        Remove PHP {v} only
                                      </Button>
                                    ))}
                                    <Button
                                      danger
                                      type="primary"
                                      block
                                      onClick={() => {
                                        Modal.destroyAll();
                                        handleUninstall(manageSW);
                                      }}
                                    >
                                      Remove all versions
                                    </Button>
                                  </Space>
                                </div>
                              ),
                              footer: null,
                            });
                          } else {
                            handleUninstall(manageSW);
                          }
                        }}
                      >Uninstall</Button>
                    </Space>
                  </div>
                ),
              },
              {
                key: 'config',
                label: <span><FileTextOutlined /> Configuration</span>,
                children: (
                  <Spin spinning={configLoading}>
                    <Input.TextArea
                      value={swConfig}
                      onChange={(e) => setSwConfig(e.target.value)}
                      rows={18}
                      style={{ fontSize: 13 }}
                    />
                    <div style={{ marginTop: 12, textAlign: 'right' }}>
                      <Button type="primary" loading={savingConfig} onClick={saveConfig}>
                        Save Configuration
                      </Button>
                    </div>
                  </Spin>
                ),
              },
            ]}
          />
        )}
      </Modal>

      <NginxManageModal open={nginxModalOpen} onClose={() => setNginxModalOpen(false)} />
      <ApacheManageModal open={apacheModalOpen} onClose={() => setApacheModalOpen(false)} />
      <PhpMyAdminManageModal open={pmaModalOpen} onClose={() => setPmaModalOpen(false)} />
      <PHPManageModal open={phpModalOpen} onClose={() => setPhpModalOpen(false)} />
      <OLSManageModal open={olsModalOpen} onClose={() => setOlsModalOpen(false)} />
      <FTPManageModal open={ftpModalOpen} onClose={() => setFtpModalOpen(false)} />
      <MariadbManageModal open={mariadbModalOpen} onClose={() => setMariadbModalOpen(false)} />
      <RedisManageModal open={redisModalOpen} onClose={() => setRedisModalOpen(false)} />
      <FTPStorageManageModal open={ftpStorageModalOpen} onClose={() => setFtpStorageModalOpen(false)} />
      <S3StorageManageModal open={s3ModalOpen} onClose={() => setS3ModalOpen(false)} />
      <GoogleDriveManageModal open={googleDriveModalOpen} onClose={() => setGoogleDriveModalOpen(false)} />
      <OneDriveManageModal open={oneDriveModalOpen} onClose={() => setOneDriveModalOpen(false)} />
    </div>
  );
}
