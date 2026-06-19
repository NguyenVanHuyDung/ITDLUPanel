import { useState, useCallback, useEffect, useRef } from 'react';
import { Dropdown, Button, Tooltip, message, App, Input, Skeleton, Empty } from 'antd';
import {
  ThunderboltOutlined,
  CaretRightOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  DesktopOutlined,
  RocketOutlined,
  ExclamationCircleFilled,
  ClockCircleOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import api from '@/services/api';
import { useIsMobile } from '@/hooks/useIsMobile';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActionType = 'software' | 'docker' | 'waf' | 'reload'
                 | 'panel-restart' | 'server-reboot' | 'server-shutdown';

interface ServiceAction {
  key: string;
  name: string;
  description: string;     // Secondary line (e.g. version + port)
  type: ActionType;
  danger?: boolean;
  confirmPhrase?: string;  // User must type this to confirm dangerous actions
}

interface InstalledService {
  key: string;
  name: string;            // Display name (e.g. "Nginx")
  description: string;     // Version info, e.g. "v1.24.0" or "8.3, 8.2"
  type: 'software' | 'docker' | 'waf';
  reloadable?: boolean;     // Whether this service supports graceful reload
}

// Response shape from GET /software
interface AvailableSoftware {
  name: string;
  display_name: string;
  type: string;
  installed: boolean;
  installed_versions?: string[];
  default_version?: string;
}

// Response shape from GET /waf/status
interface WAFStatus {
  installed?: boolean;
  haproxy_installed?: boolean;
  coraza_installed?: boolean;
}

// ---------------------------------------------------------------------------
// Built-in icons (no need to depend on installed software)
// ---------------------------------------------------------------------------

// Dangerous actions that need a typed confirmation and have a 5s
// cancellable countdown on the backend.
const DANGEROUS_ACTIONS: ServiceAction[] = [
  {
    key: 'panel-restart',
    name: 'Restart Panel',
    description: 'Restart the ITDLUPanel service',
    type: 'panel-restart',
    danger: true,
    confirmPhrase: 'RESTART PANEL',
  },
  {
    key: 'server-reboot',
    name: 'Reboot Server',
    description: 'Reboot the host machine (ALL services go down)',
    type: 'server-reboot',
    danger: true,
    confirmPhrase: 'REBOOT SERVER',
  },
  {
    key: 'server-shutdown',
    name: 'Shutdown Server',
    description: 'Power off the host (manual power-on required)',
    type: 'server-shutdown',
    danger: true,
    confirmPhrase: 'SHUTDOWN',
  },
];

interface PendingState {
  action: string;
  remaining_seconds: number;
  pending: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map raw /software response to a list of installed services the user
 * can act on. Only services marked `installed: true` are returned, and
 * only ones that have a corresponding restart endpoint on the backend.
 */
function pickInstalledServices(available: AvailableSoftware[]): InstalledService[] {
  const out: InstalledService[] = [];
  for (const s of available) {
    if (!s.installed) continue;

    // Build a friendly version string
    let version = s.default_version || '';
    if (s.installed_versions && s.installed_versions.length > 0) {
      version = s.installed_versions.join(', ');
    }
    if (s.name === 'docker') {
      version = version || 'stable';
    }
    version = version.replace(/^(nginx|mysql|mariadb|php|postgresql)-?/i, '');

    // Per-service restart key & display description
    switch (s.name) {
      case 'nginx':
      case 'apache':
      case 'openlitespeed': {
        out.push({
          key: s.name,
          name: s.display_name,
          description: version ? `v${version} · web server` : 'Web server',
          type: 'software',
          reloadable: s.name === 'nginx',
        });
        break;
      }
      case 'mysql':
      case 'postgresql':
      case 'mongodb': {
        out.push({
          key: s.name,
          name: s.display_name,
          description: version ? `v${version} · database` : 'Database',
          type: 'software',
        });
        break;
      }
      case 'php': {
        // PHP-FPM is multi-version. Each version has its own service
        // unit named "php{ver}-fpm" (e.g. "php8.3-fpm") — see
        // resolveServiceName in software_service.go.
        const versions = s.installed_versions && s.installed_versions.length > 0
          ? s.installed_versions
          : (s.default_version ? [s.default_version] : []);
        for (const v of versions) {
          const majorMinor = v.replace(/^(\d+\.\d+).*/, '$1'); // "8.3" from "8.3.x"
          out.push({
            key: `php${majorMinor}-fpm`,
            name: `PHP-FPM ${majorMinor}`,
            description: `FastCGI process manager · v${majorMinor}`,
            type: 'software',
          });
        }
        break;
      }
      case 'redis':
      case 'memcached': {
        out.push({
          key: s.name,
          name: s.display_name,
          description: version ? `v${version} · cache` : 'Cache',
          type: 'software',
        });
        break;
      }
      case 'pureftpd': {
        out.push({
          key: s.name,
          name: s.display_name,
          description: version ? `v${version} · FTP server` : 'FTP server',
          type: 'software',
        });
        break;
      }
      case 'docker': {
        out.push({
          key: s.name,
          name: s.display_name,
          description: version ? `v${version} · ⚠️ restarts all containers` : '⚠️ restarts all containers',
          type: 'docker',
        });
        break;
      }
      // phpmyadmin, pgadmin, golang, python, nodejs, tomcat, supervisor,
      // elasticsearch, envoy, ftp_storage, onedrive, google_drive,
      // s3_storage — these are tools, not services with restart
      // endpoints, so we skip them.
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function QuickActions() {
  const { modal } = App.useApp();
  const isMobile = useIsMobile();
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Installed services state
  const [services, setServices] = useState<InstalledService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const servicesCache = useRef<{ data: InstalledService[]; at: number } | null>(null);

  // Pending dangerous action
  const [pending, setPending] = useState<PendingState>({ action: '', remaining_seconds: 0, pending: false });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -----------------------------------------------------------------
  // Fetch installed services on mount and when dropdown opens
  // (with a 30s cache so we don't hammer the backend on every click)
  // -----------------------------------------------------------------
  const fetchInstalled = useCallback(async (force = false) => {
    if (!force && servicesCache.current) {
      const age = Date.now() - servicesCache.current.at;
      if (age < 30_000) {
        setServices(servicesCache.current.data);
        return;
      }
    }
    setServicesLoading(true);
    setServicesError(null);
    try {
      const [swR, wafR] = await Promise.allSettled([
        api.get<{ data: { available: AvailableSoftware[] } }>('/software'),
        api.get<{ data: WAFStatus }>('/waf/status'),
      ]);

      const installed: InstalledService[] = [];
      if (swR.status === 'fulfilled') {
        installed.push(...pickInstalledServices(swR.value.data.data.available || []));
      }
      if (wafR.status === 'fulfilled') {
        const waf = wafR.value.data.data;
        if (waf.installed) {
          installed.push({
            key: 'waf',
            name: 'WAF',
            description: 'Web Application Firewall',
            type: 'waf',
          });
        }
      }

      setServices(installed);
      servicesCache.current = { data: installed, at: Date.now() };
    } catch (err: any) {
      setServicesError(err?.response?.data?.message || err?.message || 'Failed to load services');
    } finally {
      setServicesLoading(false);
    }
  }, []);

  // Initial load + refresh whenever the dropdown opens
  useEffect(() => {
    if (open) {
      // Use cache if fresh, else fetch
      fetchInstalled(false);
    }
  }, [open, fetchInstalled]);

  // Poll /system/pending-action every second while dropdown is open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const { data } = await api.get<{ data: PendingState }>('/system/pending-action');
        if (!cancelled) setPending(data.data);
      } catch { /* ignore */ }
    };
    poll();
    pollRef.current = setInterval(poll, 1000);
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open]);

  // -----------------------------------------------------------------
  // Action executors
  // -----------------------------------------------------------------

  // Build a "fake" ServiceAction from an installed-service descriptor
  // (used for the dynamic list). Docker and WAF are dangerous and get
  // a typed confirmation; everything else runs directly.
  const buildServiceAction = (svc: InstalledService): ServiceAction => {
    const isDangerous = svc.type === 'docker' || svc.type === 'waf';
    return {
      key: svc.key,
      name: svc.name,
      description: svc.description,
      type: svc.type,
      danger: isDangerous,
      confirmPhrase: svc.type === 'docker' ? 'RESTART DOCKER' : undefined,
    };
  };

  // Build a reload action (only Nginx for now)
  const buildReloadAction = (svc: InstalledService): ServiceAction | null => {
    if (!svc.reloadable) return null;
    return {
      key: `${svc.key}-reload`,
      name: `Reload ${svc.name} (no downtime)`,
      description: 'Graceful config reload',
      type: 'reload',
    };
  };

  const executeAction = useCallback(async (action: ServiceAction) => {
    setLoadingKey(action.key);
    setOpen(false);
    const hide = message.loading(`${action.name}…`, 0);

    try {
      let resp;
      switch (action.type) {
        case 'software':
          resp = await api.post(`/software/${action.key}/restart`);
          break;
        case 'reload':
          resp = await api.post(`/software/nginx/reload`);
          break;
        case 'docker':
          resp = await api.post('/docker/system/restart');
          break;
        case 'waf':
          resp = await api.post('/waf/restart');
          break;
      }
      hide();
      const msg = resp?.data?.message || `${action.name} done`;
      message.success({
        content: (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <CheckCircleOutlined style={{ color: '#52c41a' }} /> {msg}
          </span>
        ),
        duration: 3,
      });
      // Bump cache so the next open shows the fresh running state
      servicesCache.current = null;
    } catch (err: any) {
      hide();
      const errMsg = err?.response?.data?.message || err?.message || 'Action failed';
      message.error({
        content: (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <CloseCircleOutlined style={{ color: '#ff4d4f' }} /> {action.name}: {errMsg}
          </span>
        ),
        duration: 4,
      });
    } finally {
      setLoadingKey(null);
    }
  }, []);

  // Confirmation modal for dangerous actions
  const confirmDangerous = (action: ServiceAction) => {
    modal.confirm({
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <ExclamationCircleFilled style={{ color: '#ff4d4f', fontSize: 18 }} />
          {action.name}
        </span>
      ),
      icon: null,
      content: (
        <div>
          <p style={{ margin: '0 0 12px', fontSize: 13 }}>{action.description}</p>
          <div style={{
            padding: 10, borderRadius: 6, marginBottom: 12,
            background: '#fff2f0', border: '1px solid #ffccc7',
            fontSize: 12, color: '#cf1322',
          }}>
            <strong>⚠️ This will disrupt service availability.</strong> After confirmation there
            is a <strong>5-second countdown</strong> during which you can cancel from this menu.
          </div>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.65)', marginBottom: 6 }}>
            Type <code style={{
              background: 'rgba(0,0,0,0.06)', padding: '1px 6px', borderRadius: 3,
              fontWeight: 600, color: '#ff4d4f',
            }}>{action.confirmPhrase}</code> to confirm:
          </div>
          <Input
            placeholder={action.confirmPhrase}
            autoFocus
            allowClear
          />
        </div>
      ),
      okText: 'Confirm & Schedule',
      okButtonProps: { danger: true, disabled: true },
      cancelText: 'Cancel',
      onOk: () => executeAction(action),
    });
    // Enable OK button only when phrase matches
    const interval = setInterval(() => {
      const input = document.querySelector<HTMLInputElement>('.ant-modal input[placeholder]');
      const okBtn = document.querySelector<HTMLButtonElement>('.ant-modal .ant-btn-dangerous');
      if (!input || !okBtn) return;
      const shouldEnable = input.value === action.confirmPhrase;
      if (okBtn.disabled !== !shouldEnable) {
        okBtn.disabled = !shouldEnable;
      }
    }, 100);
    setTimeout(() => clearInterval(interval), 60_000);
  };

  // Execute dangerous action and start polling the countdown
  const executeDangerous = async (action: ServiceAction) => {
    setLoadingKey(action.key);
    try {
      const resp = await api.post(`/system/${action.type}`);
      const data = resp.data?.data || {};
      setPending({
        action: data.action || action.type,
        remaining_seconds: data.remaining_seconds || 5,
        pending: true,
      });
      message.warning({
        content: (
          <span>
            {action.name} scheduled in <strong>{data.remaining_seconds || 5}s</strong>.
            You can cancel from the Quick Actions menu.
          </span>
        ),
        duration: 6,
      });
      setOpen(true);
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Failed to schedule action';
      message.error(errMsg);
    } finally {
      setLoadingKey(null);
    }
  };

  const cancelPending = async () => {
    try {
      const { data } = await api.post('/system/cancel');
      const result = data.data;
      if (result.cancelled) {
        message.success(`${result.action} cancelled`);
      } else {
        message.warning(result.reason || 'Could not cancel');
      }
      setPending({ action: '', remaining_seconds: 0, pending: false });
    } catch {
      message.error('Cancel failed');
    }
  };

  // -----------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------

  const renderServiceItem = (action: ServiceAction) => {
    const isLoading = loadingKey === action.key;
    const color = action.danger ? '#ff4d4f' : '#1677ff';
    const isDangerousSystem = action.type === 'panel-restart'
      || action.type === 'server-reboot'
      || action.type === 'server-shutdown';
    const isDangerousService = action.danger === true;
    const needsConfirm = isDangerousSystem || isDangerousService;
    return (
      <div
        key={action.key}
        onClick={(e) => {
          e.stopPropagation();
          if (isLoading) return;
          if (needsConfirm) {
            confirmDangerous(action);
          } else {
            executeAction(action);
          }
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 12px', borderRadius: 6,
          cursor: isLoading ? 'wait' : 'pointer',
          transition: 'background 0.12s',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(22, 119, 255, 0.06)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
      >
        {isLoading ? (
          <LoadingOutlined style={{ fontSize: 14, color: '#1677ff' }} />
        ) : needsConfirm ? (
          <PoweroffOutlined style={{ fontSize: 13, color }} />
        ) : action.type === 'reload' ? (
          <ReloadOutlined style={{ fontSize: 13, color }} />
        ) : (
          <CaretRightOutlined style={{ fontSize: 12, color }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: isDangerousService ? color : undefined }}>
            {action.name}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', marginTop: 1 }}>
            {action.description}
          </div>
        </div>
      </div>
    );
  };

  // Split services into reloadable + restartable
  const reloadActions: ServiceAction[] = services
    .map(buildReloadAction)
    .filter((a): a is ServiceAction => a !== null);
  const restartActions: ServiceAction[] = services.map(buildServiceAction);

  const dropdownContent = (
    <div
      style={{
        background: '#fff',
        borderRadius: 10,
        boxShadow: '0 6px 16px rgba(0,0,0,0.12), 0 3px 6px rgba(0,0,0,0.08)',
        border: '1px solid #f0f0f0',
        padding: 6,
        minWidth: 300,
        maxWidth: 360,
        maxHeight: '75vh',
        overflowY: 'auto',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{
        padding: '6px 12px 8px',
        borderBottom: '1px solid #f0f0f0',
        marginBottom: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 600, color: 'rgba(0,0,0,0.45)',
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            Quick Actions
          </div>
          <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>
            Only installed services are shown
          </div>
        </div>
        <Tooltip title="Refresh services">
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined style={{ fontSize: 12 }} />}
            onClick={(e) => {
              e.stopPropagation();
              servicesCache.current = null;
              fetchInstalled(true);
            }}
            style={{ color: 'rgba(0,0,0,0.45)' }}
          />
        </Tooltip>
      </div>

      {/* Pending action banner */}
      {pending.pending && (
        <div style={{
          margin: '4px 8px 8px',
          padding: 10, borderRadius: 8,
          background: pending.action === 'panel-restart' ? '#fff7e6' : '#fff1f0',
          border: `1px solid ${pending.action === 'panel-restart' ? '#ffd591' : '#ffa39e'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {pending.action === 'panel-restart' ? (
              <RocketOutlined style={{ color: '#fa8c16' }} />
            ) : (
              <DesktopOutlined style={{ color: '#ff4d4f' }} />
            )}
            <div style={{ flex: 1, fontSize: 12 }}>
              <div style={{ fontWeight: 600, color: '#cf1322' }}>
                {pending.action === 'panel-restart' && 'Restarting panel in'}
                {pending.action === 'server-reboot' && 'Rebooting server in'}
                {pending.action === 'server-shutdown' && 'Shutting down in'}
                {' '}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontFamily: 'monospace', fontSize: 13,
                  background: 'rgba(0,0,0,0.06)', padding: '0 6px', borderRadius: 4,
                }}>
                  <ClockCircleOutlined /> {pending.remaining_seconds}s
                </span>
              </div>
              {pending.action !== 'panel-restart' && (
                <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.55)', marginTop: 2 }}>
                  Panel restart cannot be cancelled once issued.
                </div>
              )}
            </div>
            {pending.action !== 'panel-restart' && (
              <Button
                size="small"
                danger
                onClick={cancelPending}
                style={{ flexShrink: 0 }}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Loading state */}
      {servicesLoading && services.length === 0 && (
        <div style={{ padding: 12 }}>
          <Skeleton active paragraph={{ rows: 4 }} title={false} />
        </div>
      )}

      {/* Error state */}
      {servicesError && !servicesLoading && (
        <div style={{ padding: 16, textAlign: 'center', color: '#ff4d4f', fontSize: 12 }}>
          {servicesError}
          <div style={{ marginTop: 8 }}>
            <Button size="small" onClick={() => fetchInstalled(true)}>Retry</Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!servicesLoading && !servicesError && services.length === 0 && (
        <div style={{ padding: 20 }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                No services installed yet
              </span>
            }
          />
        </div>
      )}

      {/* Reload section (safe, no downtime) */}
      {reloadActions.length > 0 && (
        <>
          <div style={{
            padding: '4px 12px', fontSize: 10, fontWeight: 600,
            color: 'rgba(0,0,0,0.45)', textTransform: 'uppercase', letterSpacing: 0.5,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <CheckOutlined style={{ fontSize: 9, color: '#52c41a' }} /> Reload (no downtime)
          </div>
          {reloadActions.map(renderServiceItem)}
        </>
      )}

      {/* Restart section */}
      {restartActions.length > 0 && (
        <>
          <div style={{
            padding: '4px 12px', marginTop: 6, fontSize: 10, fontWeight: 600,
            color: 'rgba(0,0,0,0.45)', textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            Restart Services ({restartActions.length})
          </div>
          {restartActions.map(renderServiceItem)}
        </>
      )}

      {/* Dangerous actions section (always shown) */}
      <div style={{
        padding: '4px 12px', marginTop: 8, fontSize: 10, fontWeight: 600,
        color: '#ff4d4f', textTransform: 'uppercase', letterSpacing: 0.5,
      }}>
        ⚠️ Dangerous
      </div>
      {DANGEROUS_ACTIONS.map(renderServiceItem)}
    </div>
  );

  return (
    <Tooltip title="Quick Actions">
      <Dropdown
        open={open}
        onOpenChange={setOpen}
        trigger={['click']}
        placement="bottomRight"
        dropdownRender={() => dropdownContent}
      >
        <Button
          type="text"
          icon={<ThunderboltOutlined />}
          size="small"
          loading={loadingKey !== null}
          style={{
            color: 'rgba(255,255,255,0.9)',
            fontSize: isMobile ? 13 : 15,
            width: 32, height: 32,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        />
      </Dropdown>
    </Tooltip>
  );
}
