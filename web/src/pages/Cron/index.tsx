import { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Modal, Form, Input, Select, message, Popconfirm, Tooltip, InputNumber, Spin } from 'antd';
import {
  PlusOutlined, DeleteOutlined, ReloadOutlined,
  ThunderboltOutlined, DatabaseOutlined, SearchOutlined,
  CloudServerOutlined, SafetyCertificateOutlined, FolderOutlined,
  ClockCircleOutlined, CheckCircleOutlined, StopOutlined, SettingOutlined,
  InfoCircleOutlined, PlayCircleOutlined,
  MailOutlined, HddOutlined, DesktopOutlined, ToolOutlined,
  SyncOutlined, FileTextOutlined, SecurityScanOutlined, AlertOutlined,
  ClearOutlined, MonitorOutlined, CodeOutlined, SwapOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { ApiResponse } from '@/types';
import api from '@/services/api';
import { formatDateTime } from '@/lib/datetime';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePalette } from '@/hooks/usePalette';

interface CronJob {
  id: number;
  name: string;
  schedule: string;
  command: string;
  type: string;
  status: number;
  last_run?: string;
  created_at: string;
}

interface CronTemplate {
  name: string;
  description: string;
  schedule: string;
  command: string;
  type: string;
  icon: React.ReactNode;
  color: string;
  backupDir?: string;
  backupPattern?: string;
  defaultMaxKeep?: number;
  /** Template requires selecting a site from the panel */
  needsSitePicker?: boolean;
  /** Template requires selecting a database from the panel */
  needsDbPicker?: boolean;
  /** If true, uses CLI --all flag instead of --target */
  backupAll?: boolean;
  /** CLI backup type: site, database, panel */
  cliBackupType?: string;
}

function cronToHuman(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [minute, hour, dom, month, dow] = parts;
  const dayNames: Record<string, string> = { '0': 'Sunday', '1': 'Monday', '2': 'Tuesday', '3': 'Wednesday', '4': 'Thursday', '5': 'Friday', '6': 'Saturday', '7': 'Sunday' };
  const monthNames: Record<string, string> = { '1': 'Jan', '2': 'Feb', '3': 'Mar', '4': 'Apr', '5': 'May', '6': 'Jun', '7': 'Jul', '8': 'Aug', '9': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec' };
  const pad = (v: string) => v.padStart(2, '0');
  const timeStr = (h: string, m: string) => `${pad(h)}:${pad(m)}`;
  if (expr === '* * * * *') return 'Every minute';
  if (minute.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*')
    return `Every ${minute.slice(2)} minutes`;
  if (minute !== '*' && hour.startsWith('*/') && dom === '*' && month === '*' && dow === '*')
    return `Every ${hour.slice(2)} hours at :${pad(minute)}`;
  if (minute !== '*' && !minute.includes('/') && hour === '*' && dom === '*' && month === '*' && dow === '*')
    return `Every hour at :${pad(minute)}`;
  if (minute !== '*' && hour !== '*' && !minute.includes('/') && !hour.includes('/') && dom === '*' && month === '*' && dow === '*')
    return `Every day at ${timeStr(hour, minute)}`;
  if (minute !== '*' && hour !== '*' && dom === '*' && month === '*' && dow !== '*' && !dow.includes('/')) {
    const dayList = dow.split(',').map(d => dayNames[d] || d).join(', ');
    return `Every ${dayList} at ${timeStr(hour, minute)}`;
  }
  if (minute !== '*' && hour !== '*' && dom !== '*' && !dom.includes('/') && month === '*' && dow === '*') {
    const suffix = dom === '1' ? 'st' : dom === '2' ? 'nd' : dom === '3' ? 'rd' : 'th';
    return `Monthly on the ${dom}${suffix} at ${timeStr(hour, minute)}`;
  }
  if (minute !== '*' && hour !== '*' && dom !== '*' && month !== '*' && dow === '*')
    return `Yearly on ${monthNames[month] || month} ${dom} at ${timeStr(hour, minute)}`;
  return expr;
}

interface ScheduleState {
  mode: 'preset' | 'custom' | 'builder';
  preset: string;
  custom: string;
  freq: 'minute' | 'hour' | 'day' | 'week' | 'month';
  minute: number;
  hour: number;
  dom: number;
  dow: number;
  interval: number;
}

function buildCronFromState(s: ScheduleState): string {
  switch (s.freq) {
    case 'minute': return s.interval <= 1 ? '* * * * *' : `*/${s.interval} * * * *`;
    case 'hour':   return `${s.minute} * * * *`;
    case 'day':    return `${s.minute} ${s.hour} * * *`;
    case 'week':   return `${s.minute} ${s.hour} * * ${s.dow}`;
    case 'month':  return `${s.minute} ${s.hour} ${s.dom} * *`;
    default:       return '* * * * *';
  }
}

function parseCronToState(expr: string): ScheduleState | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dom, , dow] = parts;
  const base: ScheduleState = { mode: 'builder', preset: '', custom: '', freq: 'day', minute: 0, hour: 0, dom: 1, dow: 0, interval: 5 };

  // Every minute or */N minutes
  if (minute === '*' && hour === '*' && dom === '*' && dow === '*')
    return { ...base, freq: 'minute', interval: 1 };
  if (minute.startsWith('*/') && hour === '*' && dom === '*' && dow === '*')
    return { ...base, freq: 'minute', interval: parseInt(minute.slice(2)) || 5 };
  // Every hour at :MM
  if (!minute.includes('*') && !minute.includes('/') && hour === '*' && dom === '*' && dow === '*')
    return { ...base, freq: 'hour', minute: parseInt(minute) || 0 };
  // Weekly
  if (!minute.includes('*') && !hour.includes('*') && dom === '*' && dow !== '*' && !dow.includes('/'))
    return { ...base, freq: 'week', minute: parseInt(minute) || 0, hour: parseInt(hour) || 0, dow: parseInt(dow) || 0 };
  // Monthly
  if (!minute.includes('*') && !hour.includes('*') && dom !== '*' && !dom.includes('/') && dow === '*')
    return { ...base, freq: 'month', minute: parseInt(minute) || 0, hour: parseInt(hour) || 0, dom: parseInt(dom) || 1 };
  // Daily (catch-all for H:M * * *)
  if (!minute.includes('*') && !hour.includes('*') && dom === '*' && dow === '*')
    return { ...base, freq: 'day', minute: parseInt(minute) || 0, hour: parseInt(hour) || 0 };

  return null;
}

const CRON_TEMPLATES: CronTemplate[] = [
  // ── Backup ──
  {
    name: 'Backup All Databases',
    description: 'Backup every MySQL/MariaDB database (registered in panel DB)',
    schedule: '0 2 * * *',
    command: 'itdlupanel backup -type=database -all',
    type: 'shell', icon: <DatabaseOutlined />, color: '#4479A1',
    cliBackupType: 'database', backupAll: true, defaultMaxKeep: 10,
  },
  {
    name: 'Backup Single Database',
    description: 'Backup a specific database — select below',
    schedule: '0 3 * * *',
    command: 'itdlupanel backup -type=database -target=mydb',
    type: 'shell', icon: <DatabaseOutlined />, color: '#2E7D32',
    cliBackupType: 'database', needsDbPicker: true, defaultMaxKeep: 10,
  },
  {
    name: 'Backup All Sites',
    description: 'Backup every website registered in panel',
    schedule: '0 3 * * *',
    command: 'itdlupanel backup -type=site -all',
    type: 'shell', icon: <CloudServerOutlined />, color: '#1565C0',
    cliBackupType: 'site', backupAll: true, defaultMaxKeep: 5,
  },
  {
    name: 'Backup Single Site',
    description: 'Backup a specific website — select below',
    schedule: '0 4 * * *',
    command: 'itdlupanel backup -type=site -target=example.com',
    type: 'shell', icon: <FolderOutlined />, color: '#FF9800',
    cliBackupType: 'site', needsSitePicker: true, defaultMaxKeep: 10,
  },
  {
    name: 'Full Panel Backup',
    description: 'Backup panel config + database (configs, data)',
    schedule: '0 1 * * 0',
    command: 'itdlupanel backup -type=panel',
    type: 'shell', icon: <SafetyCertificateOutlined />, color: '#9C27B0',
    cliBackupType: 'panel', defaultMaxKeep: 4,
  },
  // ── SSL ──
  {
    name: 'Renew SSL Certificates',
    description: 'Auto-renew Let\'s Encrypt SSL certificates',
    schedule: '0 6 * * 1',
    command: 'certbot renew --quiet --post-hook "systemctl reload nginx"',
    type: 'shell', icon: <SafetyCertificateOutlined />, color: '#0288D1',
  },
  // ── Cleanup ──
  {
    name: 'Clear Temp & Cache',
    description: 'Clean system temp files and application caches',
    schedule: '0 4 * * *',
    command: 'rm -rf /tmp/phpmyadmin_extract /tmp/*.zip && apt-get clean -y 2>/dev/null; echo "Cleanup done"',
    type: 'shell', icon: <ClearOutlined />, color: '#607D8B',
  },
  {
    name: 'Clear Old Logs',
    description: 'Delete log files older than 30 days to free disk space',
    schedule: '0 5 * * 0',
    command: 'find /var/log -type f -name "*.log" -mtime +30 -delete && find /var/log -type f -name "*.gz" -mtime +30 -delete; echo "Old logs cleaned"',
    type: 'shell', icon: <FileTextOutlined />, color: '#795548',
  },
  {
    name: 'Purge Nginx Cache',
    description: 'Clear Nginx proxy cache and temp files',
    schedule: '0 3 * * 0',
    command: 'rm -rf /var/cache/nginx/* /tmp/nginx_* 2>/dev/null && systemctl reload nginx; echo "Nginx cache purged"',
    type: 'shell', icon: <ClearOutlined />, color: '#00897B',
  },
  {
    name: 'Clean Docker Resources',
    description: 'Remove unused Docker images, containers, volumes and networks',
    schedule: '0 4 * * 0',
    command: 'docker system prune -af 2>/dev/null; echo "Docker cleanup done"',
    type: 'shell', icon: <ClearOutlined />, color: '#0db7ed',
  },
  {
    name: 'Clear PHP OPcache',
    description: 'Reset PHP OPcache to apply code changes',
    schedule: '*/30 * * * *',
    command: 'php -r "opcache_reset();" 2>/dev/null || echo "OPcache not available"; echo "OPcache cleared"',
    type: 'shell', icon: <SyncOutlined />, color: '#8993BE',
  },
  // ── System Maintenance ──
  {
    name: 'System Update Check',
    description: 'Check for available system package updates (apt)',
    schedule: '0 6 * * 1',
    command: 'apt-get update -qq && apt list --upgradable 2>/dev/null | head -20; echo "Update check done"',
    type: 'shell', icon: <DesktopOutlined />, color: '#E65100',
  },
  {
    name: 'Disk Usage Report',
    description: 'Log top 15 largest directories for disk monitoring',
    schedule: '0 7 * * *',
    command: 'echo "=== Disk Usage Report ===" && df -h / && echo "" && du -sh /* 2>/dev/null | sort -rh | head -15',
    type: 'shell', icon: <HddOutlined />, color: '#6D4C41',
  },
  {
    name: 'Memory Usage Report',
    description: 'Log memory and swap usage summary',
    schedule: '0 */6 * * *',
    command: 'echo "=== Memory Report ===" && free -h && echo "" && echo "Top 10 memory consumers:" && ps aux --sort=-%mem | head -11',
    type: 'shell', icon: <MonitorOutlined />, color: '#AD1457',
  },
  {
    name: 'Restart Nginx',
    description: 'Graceful restart of Nginx web server',
    schedule: '0 5 * * *',
    command: 'systemctl reload nginx && echo "Nginx reloaded" || (systemctl restart nginx && echo "Nginx restarted")',
    type: 'shell', icon: <SyncOutlined />, color: '#2E7D32',
  },
  {
    name: 'Restart MySQL',
    description: 'Restart MySQL/MariaDB database server',
    schedule: '0 5 * * 0',
    command: 'systemctl restart mysql 2>/dev/null || systemctl restart mariadb 2>/dev/null; echo "DB server restarted"',
    type: 'shell', icon: <SyncOutlined />, color: '#4479A1',
  },
  {
    name: 'Restart PHP-FPM',
    description: 'Restart all PHP-FPM versions',
    schedule: '0 5 * * 0',
    command: 'for v in 8.1 8.3 8.4; do systemctl restart php${v}-fpm 2>/dev/null; done; echo "PHP-FPM restarted"',
    type: 'shell', icon: <SyncOutlined />, color: '#8993BE',
  },
  {
    name: 'Sync System Clock (NTP)',
    description: 'Force-sync system time with NTP servers',
    schedule: '0 */12 * * *',
    command: 'timedatectl set-ntp true && chronyc makestep 2>/dev/null || ntpdate pool.ntp.org 2>/dev/null; echo "Time synced"',
    type: 'shell', icon: <ClockCircleOutlined />, color: '#546E7A',
  },
  // ── Security ──
  {
    name: 'Scan for Rootkits',
    description: 'Run rkhunter to check for rootkits (install rkhunter first)',
    schedule: '0 3 * * 1',
    command: 'rkhunter --update --quiet 2>/dev/null; rkhunter --check --skip-keypress --quiet 2>&1 | tail -20',
    type: 'shell', icon: <SecurityScanOutlined />, color: '#D32F2F',
  },
  {
    name: 'Check Failed SSH Logins',
    description: 'Report failed SSH login attempts from auth log',
    schedule: '0 8 * * *',
    command: 'echo "=== Failed SSH Logins (24h) ===" && grep "Failed password" /var/log/auth.log 2>/dev/null | tail -20 || echo "No auth.log found"',
    type: 'shell', icon: <AlertOutlined />, color: '#C62828',
  },
  {
    name: 'Update Fail2Ban',
    description: 'Restart Fail2Ban and show currently banned IPs',
    schedule: '0 6 * * *',
    command: 'systemctl restart fail2ban 2>/dev/null && fail2ban-client status sshd 2>/dev/null || echo "Fail2Ban not installed"',
    type: 'shell', icon: <SecurityScanOutlined />, color: '#BF360C',
  },
  {
    name: 'Check Open Ports',
    description: 'List all listening ports and associated processes',
    schedule: '0 9 * * 1',
    command: 'echo "=== Open Ports ===" && ss -tlnp | grep LISTEN',
    type: 'shell', icon: <SecurityScanOutlined />, color: '#F57C00',
  },
  // ── Database Maintenance ──
  {
    name: 'Optimize MySQL Tables',
    description: 'Optimize all MySQL/MariaDB tables to reclaim space',
    schedule: '0 4 * * 0',
    command: 'mysqlcheck --all-databases --optimize -u root 2>&1 | tail -20; echo "MySQL optimize done"',
    type: 'shell', icon: <ToolOutlined />, color: '#4479A1',
  },
  {
    name: 'MySQL Slow Query Report',
    description: 'Show recent slow queries from MySQL slow log',
    schedule: '0 8 * * *',
    command: 'echo "=== MySQL Slow Queries ===" && mysqldumpslow -s t /var/lib/mysql/*-slow.log 2>/dev/null | head -30 || echo "Slow query log not found (ensure slow_query_log=ON in MySQL)"',
    type: 'shell', icon: <DatabaseOutlined />, color: '#F9A825',
  },
  {
    name: 'Flush MySQL Logs',
    description: 'Rotate MySQL binary logs to free disk space',
    schedule: '0 2 * * 0',
    command: 'mysql -u root -e "PURGE BINARY LOGS BEFORE DATE(NOW() - INTERVAL 7 DAY);" 2>&1; echo "MySQL logs flushed"',
    type: 'shell', icon: <DatabaseOutlined />, color: '#00695C',
  },
  // ── Monitoring & Notifications ──
  {
    name: 'Service Health Check',
    description: 'Check if Nginx, MySQL, and PHP-FPM are running',
    schedule: '*/5 * * * *',
    command: 'for svc in nginx mariadb php8.4-fpm; do systemctl is-active --quiet $svc && echo "$svc: OK" || echo "$svc: DOWN!"; done',
    type: 'shell', icon: <MonitorOutlined />, color: '#1B5E20',
  },
  {
    name: 'Disk Space Alert',
    description: 'Alert if disk usage exceeds 90%',
    schedule: '*/30 * * * *',
    command: 'USAGE=$(df / | awk "NR==2 {print \\$5}" | tr -d "%"); [ "$USAGE" -gt 90 ] && echo "WARNING: Disk usage at ${USAGE}%!" || echo "Disk OK: ${USAGE}%"',
    type: 'shell', icon: <AlertOutlined />, color: '#E53935',
  },
  {
    name: 'Website Uptime Check',
    description: 'Check if a website is responding (change URL as needed)',
    schedule: '*/10 * * * *',
    command: 'HTTP_CODE=$(curl -o /dev/null -s -w "%{http_code}" https://localhost); [ "$HTTP_CODE" = "200" ] && echo "Site OK ($HTTP_CODE)" || echo "Site DOWN! ($HTTP_CODE)"',
    type: 'shell', icon: <CloudServerOutlined />, color: '#1565C0',
  },
  // ── Logs & Rotation ──
  {
    name: 'Rotate Access Logs',
    description: 'Compress and rotate Nginx access logs',
    schedule: '0 0 * * *',
    command: 'cd /var/log/nginx && for f in *.log; do [ -f "$f" ] && mv "$f" "${f}.$(date +%Y%m%d)" && gzip "${f}.$(date +%Y%m%d)" 2>/dev/null; done && systemctl reload nginx; echo "Logs rotated"',
    type: 'shell', icon: <SwapOutlined />, color: '#37474F',
  },
  {
    name: 'Journal Vacuum',
    description: 'Clean up systemd journal logs older than 7 days',
    schedule: '0 3 * * 0',
    command: 'journalctl --vacuum-time=7d 2>&1; echo "Journal cleaned"',
    type: 'shell', icon: <FileTextOutlined />, color: '#455A64',
  },
  // ── Custom Scripts ──
  {
    name: 'Custom Script',
    description: 'Run a custom shell script at scheduled time',
    schedule: '0 0 * * *',
    command: '/bin/bash /root/scripts/my_script.sh',
    type: 'shell', icon: <CodeOutlined />, color: '#424242',
  },
  {
    name: 'Custom URL Request',
    description: 'Send an HTTP GET request to a URL (webhook/health)',
    schedule: '*/15 * * * *',
    command: 'curl -fsS --max-time 30 --fail "https://example.com/cron-ping" -o /dev/null && echo "Ping OK" || echo "Ping FAILED"',
    type: 'url', icon: <CloudServerOutlined />, color: '#00838F',
  },
];

export default function Cron() {
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const { p, isDark } = usePalette();

  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logContent, setLogContent] = useState('');
  const [logLoading, setLogLoading] = useState(false);
  const [logJobName, setLogJobName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [runningIds, setRunningIds] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<'jobs' | 'templates'>('jobs');
  const [searchText, setSearchText] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [form] = Form.useForm();
  const [schedMode, setSchedMode] = useState<'builder' | 'custom'>('builder');
  const [schedState, setSchedState] = useState<ScheduleState>({
    mode: 'builder', preset: '', custom: '', freq: 'day', minute: 0, hour: 2, dom: 1, dow: 0, interval: 5,
  });
  const [currentTemplate, setCurrentTemplate] = useState<CronTemplate | null>(null);
  const [maxKeep, setMaxKeep] = useState<number | null>(null);
  const [sitesList, setSitesList] = useState<{ id: number; domain: string }[]>([]);
  const [dbsList, setDbsList] = useState<{ id: number; name: string }[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [panelBin, setPanelBin] = useState('/ITDLUPanel/server/bin/itdlupanel');
  const [panelCfg, setPanelCfg] = useState('-config=/ITDLUPanel/server/config/panel.json');
  const [storageType, setStorageType] = useState<string>('local');
  const [storageId, setStorageId] = useState<number | null>(null);
  const [storageOptions, setStorageOptions] = useState<{value: string; label: string}[]>([{ value: 'local', label: 'Local Only' }]);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<CronJob[]>>('/crons');
      setJobs(data.data ?? []);
    } catch { message.error(t('common.error')); }
    finally { setLoading(false); }
  }, [t]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Fetch real binary/config paths from panel-info API
  useEffect(() => {
    api.get<ApiResponse<{ binary_path?: string; config_path?: string }>>('/settings/panel-info')
      .then(({ data }) => {
        if (data.data?.binary_path) setPanelBin(data.data.binary_path);
        if (data.data?.config_path) setPanelCfg(`-config=${data.data.config_path}`);
      })
      .catch(() => { /* use defaults */ });

    // Fetch available storage destinations for backup templates
    (async () => {
      const opts: {value: string; label: string}[] = [{ value: 'local', label: 'Local Only' }];
      try {
        const { data: swData } = await api.get<ApiResponse<{ installed: unknown[]; available: { name: string; installed?: boolean }[] }>>('/software');
        const available = swData.data?.available ?? [];
        const isInstalled = (name: string) => available.some(s => s.name === name && s.installed);

        if (isInstalled('ftp_storage')) {
          try {
            const { data: ftpData } = await api.get<ApiResponse<{ id: number; name: string }[]>>('/ftp-storages');
            const ftpList = Array.isArray(ftpData.data) ? ftpData.data : [];
            ftpList.forEach(s => opts.push({ value: `ftp:${s.id}`, label: `Local + FTP: ${s.name}` }));
          } catch { /* ignore */ }
        }

        const cloudTypes: { sw: string; type: string; label: string }[] = [
          { sw: 's3_storage', type: 's3', label: 'S3' },
          { sw: 'google_drive', type: 'google_drive', label: 'Google Drive' },
          { sw: 'onedrive', type: 'onedrive', label: 'OneDrive' },
        ];
        const hasCloud = cloudTypes.some(ct => isInstalled(ct.sw));
        if (hasCloud) {
          try {
            const { data: cloudData } = await api.get<ApiResponse<{ id: number; name: string; type: string }[]>>('/cloud-storages');
            const cloudList = Array.isArray(cloudData.data) ? cloudData.data : [];
            for (const ct of cloudTypes) {
              if (isInstalled(ct.sw)) {
                cloudList.filter(s => s.type === ct.type).forEach(s =>
                  opts.push({ value: `${ct.type}:${s.id}`, label: `Local + ${ct.label}: ${s.name}` })
                );
              }
            }
          } catch { /* ignore */ }
        }
      } catch { /* ignore — just keep "Local Only" */ }
      setStorageOptions(opts);
    })();
  }, []);

  const filteredJobs = useMemo(() => {
    if (!searchText) return jobs;
    const q = searchText.toLowerCase();
    return jobs.filter(j =>
      j.name.toLowerCase().includes(q) ||
      j.command.toLowerCase().includes(q) ||
      j.schedule.includes(q)
    );
  }, [jobs, searchText]);

  // ── CRUD handlers ──────────────────────────────────────────────────

  const handleSubmit = async (values: Record<string, string>) => {
    const schedule = schedMode === 'builder' ? buildCronFromState(schedState) : values.schedule;
    setSubmitting(true);
    try {
      let command = values.command;
      // Strip any existing storage flags to avoid duplicates on edit
      command = command.replace(/\s*-storage=\S+/g, '').replace(/\s*-storage-id=\d+/g, '').trim();
      // Strip any existing max-keep flag to avoid duplicates on edit
      command = command.replace(/\s*-max-keep=\d+/g, '').trim();
      // For CLI-based backup templates, inject -max-keep, -target and storage flags
      if (currentTemplate?.cliBackupType) {
        let cmd = `${panelBin} backup -type=${currentTemplate.cliBackupType}`;
        if (currentTemplate.backupAll) {
          cmd += ' -all';
        } else if (selectedTarget) {
          cmd += ` -target=${selectedTarget}`;
        }
        if (maxKeep !== null && maxKeep > 0) {
          cmd += ` -max-keep=${maxKeep}`;
        }
        if (storageType !== 'local' && storageId) {
          const sType = storageType.split(':')[0];
          cmd += ` -storage=${sType} -storage-id=${storageId}`;
        }
        cmd += ` ${panelCfg}`;
        command = cmd;
      } else if (maxKeep !== null && maxKeep > 0) {
        // Inject -max-keep into any shell command (works for manual or template jobs)
        command += ` -max-keep=${maxKeep}`;
      }
      if (storageType !== 'local' && storageId && !currentTemplate?.cliBackupType) {
        const sType = storageType.split(':')[0];
        command += ` -storage=${sType} -storage-id=${storageId}`;
      }
      const payload = { ...values, schedule, command };
      if (editingJob) await api.put(`/crons/${editingJob.id}`, payload);
      else await api.post('/crons', payload);
      message.success(t('common.success'));
      setModalOpen(false);
      setEditingJob(null);
      setCurrentTemplate(null);
      setSelectedTarget('');
      setMaxKeep(null);
      setStorageType('local');
      setStorageId(null);
      form.resetFields();
      fetchJobs();
    } catch { message.error(t('common.error')); }
    finally { setSubmitting(false); }
  };

  const handleToggleStatus = async (record: CronJob) => {
    try {
      await api.put(`/crons/${record.id}/status`, { enabled: record.status !== 1 });
      message.success(t('common.success'));
      fetchJobs();
    } catch { message.error(t('common.error')); }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/crons/${id}`);
      message.success(t('common.success'));
      fetchJobs();
    } catch { message.error(t('common.error')); }
  };

  const handleRunNow = async (record: CronJob) => {
    setRunningIds(prev => new Set(prev).add(record.id));
    try {
      await api.post(`/crons/${record.id}/run`);
      message.success(`"${record.name}" executed`);
      fetchJobs();
    } catch { message.error(`Failed to run "${record.name}"`); }
    finally { setRunningIds(prev => { const s = new Set(prev); s.delete(record.id); return s; }); }
  };

  const handleViewLog = async (id: number, name: string) => {
    setLogJobName(name);
    setLogOpen(true);
    setLogLoading(true);
    setLogContent('');
    try {
      const { data } = await api.get<ApiResponse<{ content: string }>>(`/crons/${id}/log`);
      const content = typeof data.data === 'string' ? data.data : data.data?.content;
      setLogContent(content || 'No logs available');
    } catch { setLogContent('Failed to load logs'); }
    finally { setLogLoading(false); }
  };

  // ── Bulk actions ───────────────────────────────────────────────────

  const handleBulkDelete = () => {
    if (!selectedRowKeys.length) return;
    Modal.confirm({
      title: `Delete ${selectedRowKeys.length} cron job(s)?`,
      content: 'This action cannot be undone.',
      okButtonProps: { danger: true },
      onOk: async () => {
        let ok = 0;
        for (const id of selectedRowKeys) {
          try { await api.delete(`/crons/${id}`); ok++; } catch { /* skip */ }
        }
        message.success(`Deleted ${ok} job(s)`);
        setSelectedRowKeys([]);
        fetchJobs();
      },
    });
  };

  const handleBulkToggle = async (enable: boolean) => {
    let ok = 0;
    for (const id of selectedRowKeys) {
      try { await api.put(`/crons/${id}/status`, { enabled: enable }); ok++; } catch { /* skip */ }
    }
    message.success(`${enable ? 'Enabled' : 'Disabled'} ${ok} job(s)`);
    setSelectedRowKeys([]);
    fetchJobs();
  };

  // ── Modal helpers ──────────────────────────────────────────────────

  const openEdit = (record: CronJob) => {
    setEditingJob(record);
    setCurrentTemplate(null);
    form.setFieldsValue(record);
    const parsed = parseCronToState(record.schedule);
    if (parsed) {
      setSchedMode('builder');
      setSchedState(parsed);
    } else {
      setSchedMode('custom');
      form.setFieldsValue({ schedule: record.schedule });
    }
    // Detect backup template and populate related fields
    const detected = detectBackupTemplate(record.command);
    if (detected) {
      setCurrentTemplate({ name: record.name, command: record.command } as CronTemplate);
      setMaxKeep(detected.maxKeep ?? null);
      setSelectedTarget(detected.target || '');
      if (detected.target) {
        // Determine picker type based on backup type
        if (detected.type === 'site') {
          api.get<ApiResponse<{ id: number; domain: string }[]>>('/sites?page=1&per_page=999')
            .then(({ data }) => { const items = Array.isArray(data.data) ? data.data : []; setSitesList(items); })
            .catch(() => setSitesList([]));
        } else if (detected.type === 'database') {
          api.get<ApiResponse<{ id: number; name: string }[]>>('/databases?page=1&per_page=999')
            .then(({ data }) => { const items = Array.isArray(data.data) ? data.data : []; setDbsList(items); })
            .catch(() => setDbsList([]));
        }
      }
    } else {
      setMaxKeep(null);
      setSelectedTarget('');
    }
    // Parse storage flags from command string
    const storageMatch = record.command.match(/-storage=(\S+)/);
    const storageIdMatch = record.command.match(/-storage-id=(\d+)/);
    if (storageMatch && storageIdMatch) {
      const sType = storageMatch[1];
      const sId = storageIdMatch[1];
      setStorageType(`${sType}:${sId}`);
      setStorageId(parseInt(sId));
    } else {
      setStorageType('local');
      setStorageId(null);
    }
    setModalOpen(true);
  };

  const openCreate = (template?: CronTemplate) => {
    setEditingJob(null);
    setCurrentTemplate(template || null);
    form.resetFields();
    setSchedMode('builder');
    setSchedState({ mode: 'builder', preset: '', custom: '', freq: 'day', minute: 0, hour: 2, dom: 1, dow: 0, interval: 5 });
    setMaxKeep(template?.defaultMaxKeep ?? null);
    setSelectedTarget('');
    setStorageType('local');
    setStorageId(null);
    if (template) {
      form.setFieldsValue({ name: template.name, command: template.command, type: template.type });
      const parsed = parseCronToState(template.schedule);
      if (parsed) {
        setSchedMode('builder');
        setSchedState(parsed);
      } else {
        setSchedMode('custom');
        form.setFieldsValue({ schedule: template.schedule });
      }
      // Fetch sites/databases for picker templates
      if (template.needsSitePicker) {
        api.get<ApiResponse<{ id: number; domain: string }[]>>('/sites?page=1&per_page=999')
          .then(({ data }) => {
            const items = Array.isArray(data.data) ? data.data : [];
            setSitesList(items);
          })
          .catch(() => setSitesList([]));
      }
      if (template.needsDbPicker) {
        api.get<ApiResponse<{ id: number; name: string }[]>>('/databases?page=1&per_page=999')
          .then(({ data }) => {
            const items = Array.isArray(data.data) ? data.data : [];
            setDbsList(items);
          })
          .catch(() => setDbsList([]));
      }
    }
    setModalOpen(true);
  };

  // Detect if a command was generated by a backup template (CLI-based) OR has a -max-keep flag
  const detectBackupTemplate = (cmd: string): { type: string; target?: string; maxKeep: number } | null => {
    const binEscaped = panelBin.replace('/', '\\/');
    const m = cmd.match(new RegExp(`${binEscaped}\\s+backup\\s+-type=(\\S+)`));
    if (m) {
      const type = m[1];
      const targetMatch = cmd.match(/-target=(\S+)/);
      const maxKeepMatch = cmd.match(/-max-keep=(\d+)/);
      return {
        type,
        target: targetMatch ? targetMatch[1] : undefined,
        maxKeep: maxKeepMatch ? parseInt(maxKeepMatch[1]) : 10,
      };
    }
    // Non-backup command but may still have -max-keep
    const maxKeepMatch = cmd.match(/-max-keep=(\d+)/);
    if (maxKeepMatch) {
      return { type: '', maxKeep: parseInt(maxKeepMatch[1]) };
    }
    return null;
  };

  // ── Reusable styles ────────────────────────────────────────────────

  const ghostBtn = (color?: string): React.CSSProperties => ({
    padding: '3px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
    border: `1px solid ${color ? `${color}50` : p.cardBorder}`,
    background: color ? `${color}08` : 'transparent',
    color: color || p.textMuted, fontWeight: 500,
    display: 'inline-flex', alignItems: 'center', gap: 4,
    transition: 'all 0.15s',
  });

  const dayOptions = [
    { label: 'Sunday', value: 0 }, { label: 'Monday', value: 1 },
    { label: 'Tuesday', value: 2 }, { label: 'Wednesday', value: 3 },
    { label: 'Thursday', value: 4 }, { label: 'Friday', value: 5 },
    { label: 'Saturday', value: 6 },
  ];

  // ── Table columns ──────────────────────────────────────────────────

  const columns = [
    {
      title: t('common.name'),
      key: 'name',
      render: (_: unknown, r: CronJob) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ClockCircleOutlined style={{ color: p.accent, fontSize: 13 }} />
            <span style={{ fontWeight: 500, color: p.text, fontSize: 13 }}>{r.name}</span>
          </div>
          <div style={{ fontSize: 11, color: p.textMuted, marginLeft: 19 }}>
            {cronToHuman(r.schedule)}
            <code style={{
              marginLeft: 6, fontSize: 10, padding: '1px 5px', borderRadius: 3,
              background: p.codeBg, color: p.textMuted,
            }}>{r.schedule}</code>
          </div>
        </div>
      ),
      sorter: (a: CronJob, b: CronJob) => a.name.localeCompare(b.name),
    },
    {
      title: 'Status',
      key: 'status',
      width: 70,
      render: (_: unknown, r: CronJob) => (
        <Tooltip title={r.status === 1 ? 'Click to disable' : 'Click to enable'}>
          <button
            onClick={() => handleToggleStatus(r)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            <span style={{
              width: 7, height: 7, borderRadius: 4,
              background: r.status === 1 ? p.green : p.red,
              boxShadow: r.status === 1 ? `0 0 6px ${p.green}60` : 'none',
            }} />
            <span style={{
              fontSize: 11, fontWeight: 500,
              color: r.status === 1 ? p.green : p.red,
            }}>
              {r.status === 1 ? 'On' : 'Off'}
            </span>
          </button>
        </Tooltip>
      ),
    },
    {
      title: 'Command',
      key: 'command',
      ellipsis: true,
      width: isMobile ? 120 : 220,
      render: (_: unknown, r: CronJob) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
            background: r.type === 'shell' ? `${p.accent}15` : `${p.purple}15`,
            color: r.type === 'shell' ? p.accent : p.purple,
            flexShrink: 0,
          }}>{r.type}</span>
          <Tooltip title={r.command}>
            <span style={{ fontSize: 12, color: p.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.command}
            </span>
          </Tooltip>
        </div>
      ),
    },
    {
      title: 'Last Run',
      key: 'last_run',
      width: 150,
      render: (_: unknown, r: CronJob) => r.last_run
        ? <span style={{ fontSize: 12, color: p.text }}>{formatDateTime(r.last_run)}</span>
        : <span style={{ fontSize: 12, color: p.textMuted }}>—</span>,
    },
    {
      title: 'Operate',
      key: 'actions',
      width: 200,
      render: (_: unknown, record: CronJob) => (
        <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
          <Tooltip title="Run now">
            <button
              onClick={() => handleRunNow(record)}
              disabled={runningIds.has(record.id)}
              style={{
                padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: p.accent, color: '#fff', fontSize: 11, fontWeight: 600,
                opacity: runningIds.has(record.id) ? 0.5 : 1, transition: 'opacity 0.15s',
              }}
            ><PlayCircleOutlined style={{ fontSize: 10 }} /> Run</button>
          </Tooltip>
          <span style={{ color: p.cardBorder, margin: '0 2px', fontSize: 12 }}>|</span>
          <button onClick={() => handleViewLog(record.id, record.name)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: p.textMuted, fontSize: 12, padding: '3px 6px',
          }}>Log</button>
          <span style={{ color: p.cardBorder, margin: '0 2px', fontSize: 12 }}>|</span>
          <button onClick={() => openEdit(record)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: p.textMuted, fontSize: 12, padding: '3px 6px',
          }}>Edit</button>
          <span style={{ color: p.cardBorder, margin: '0 2px', fontSize: 12 }}>|</span>
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
            <button style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: p.red, fontSize: 12, padding: '3px 6px',
            }}>Del</button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  // ── Schedule builder ───────────────────────────────────────────────

  const scheduleBuilder = (
    <div style={{ border: `1px solid ${p.cardBorder}`, borderRadius: 8, padding: 16, background: isDark ? p.rowAlt : p.headerBg }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, color: p.text, fontSize: 13 }}>Run every:</span>
        <Select
          value={schedState.freq}
          style={{ width: isMobile ? 100 : 140 }}
          onChange={(v) => setSchedState(prev => ({ ...prev, freq: v }))}
          options={[
            { label: 'N minutes', value: 'minute' },
            { label: 'Hour', value: 'hour' },
            { label: 'Day', value: 'day' },
            { label: 'Week', value: 'week' },
            { label: 'Month', value: 'month' },
          ]}
        />
      </div>

      {schedState.freq === 'minute' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ color: p.text }}>Every</span>
          <InputNumber min={1} max={59} value={schedState.interval} onChange={(v) => setSchedState(prev => ({ ...prev, interval: v ?? 5 }))} style={{ width: 80 }} />
          <span style={{ color: p.text }}>minutes</span>
        </div>
      )}
      {schedState.freq === 'hour' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ color: p.text }}>At minute</span>
          <InputNumber min={0} max={59} value={schedState.minute} onChange={(v) => setSchedState(prev => ({ ...prev, minute: v ?? 0 }))} style={{ width: 80 }} />
        </div>
      )}
      {schedState.freq === 'day' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ color: p.text }}>At</span>
          <InputNumber min={0} max={23} value={schedState.hour} onChange={(v) => setSchedState(prev => ({ ...prev, hour: v ?? 0 }))} style={{ width: 70 }} addonAfter="h" />
          <InputNumber min={0} max={59} value={schedState.minute} onChange={(v) => setSchedState(prev => ({ ...prev, minute: v ?? 0 }))} style={{ width: 70 }} addonAfter="m" />
        </div>
      )}
      {schedState.freq === 'week' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: p.text }}>On</span>
            <Select value={schedState.dow} options={dayOptions} style={{ width: 140 }} onChange={(v) => setSchedState(prev => ({ ...prev, dow: v }))} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: p.text }}>At</span>
            <InputNumber min={0} max={23} value={schedState.hour} onChange={(v) => setSchedState(prev => ({ ...prev, hour: v ?? 0 }))} style={{ width: 70 }} addonAfter="h" />
            <InputNumber min={0} max={59} value={schedState.minute} onChange={(v) => setSchedState(prev => ({ ...prev, minute: v ?? 0 }))} style={{ width: 70 }} addonAfter="m" />
          </div>
        </div>
      )}
      {schedState.freq === 'month' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: p.text }}>On day</span>
            <InputNumber min={1} max={31} value={schedState.dom} onChange={(v) => setSchedState(prev => ({ ...prev, dom: v ?? 1 }))} style={{ width: 80 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: p.text }}>At</span>
            <InputNumber min={0} max={23} value={schedState.hour} onChange={(v) => setSchedState(prev => ({ ...prev, hour: v ?? 0 }))} style={{ width: 70 }} addonAfter="h" />
            <InputNumber min={0} max={59} value={schedState.minute} onChange={(v) => setSchedState(prev => ({ ...prev, minute: v ?? 0 }))} style={{ width: 70 }} addonAfter="m" />
          </div>
        </div>
      )}

      <div style={{
        marginTop: 12, padding: '8px 12px', borderRadius: 6,
        background: `${p.accent}10`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <ClockCircleOutlined style={{ color: p.accent }} />
        <span style={{ color: p.accent, fontWeight: 500 }}>{cronToHuman(buildCronFromState(schedState))}</span>
        <code style={{ marginLeft: 'auto', fontSize: 12, color: p.textMuted }}>{buildCronFromState(schedState)}</code>
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div style={{
      background: p.card, borderRadius: 12,
      border: `1px solid ${p.cardBorder}`,
      boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>
      {/* ── Header bar ─────────────────────────────────────────────── */}
      <div style={{
        padding: '14px 20px',
        borderBottom: `1px solid ${p.cardBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: p.headerBg, flexWrap: 'wrap', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>{t('sidebar.cron')}</span>
          <span style={{
            fontSize: 11, padding: '2px 9px', borderRadius: 4,
            background: `${p.accent}15`, color: p.accent, fontWeight: 500,
          }}>{jobs.length}</span>
        </div>
        <button
          onClick={() => openCreate()}
          style={{
            padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 500, background: p.accent, color: '#fff',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            transition: 'all 0.15s',
          }}
        >
          <PlusOutlined /> Add Job
        </button>
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────── */}
      <div style={{
        padding: '8px 20px',
        borderBottom: `1px solid ${p.cardBorder}`,
        display: 'flex', gap: 4, alignItems: 'center',
      }}>
        {([
          { key: 'jobs' as const, label: `My Jobs (${jobs.length})`, icon: <ClockCircleOutlined style={{ marginRight: 5 }} /> },
          { key: 'templates' as const, label: 'Templates', icon: <ThunderboltOutlined style={{ marginRight: 5 }} /> },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 500,
              background: activeTab === tab.key ? `${p.accent}15` : 'transparent',
              color: activeTab === tab.key ? p.accent : p.textMuted,
              display: 'inline-flex', alignItems: 'center',
              transition: 'all 0.15s',
            }}
          >{tab.icon}{tab.label}</button>
        ))}
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────── */}
      {activeTab === 'jobs' && (
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap',
          gap: 8, padding: '12px 20px',
          borderBottom: `1px solid ${p.cardBorder}`,
          background: selectedRowKeys.length > 0 ? (isDark ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.03)') : undefined,
          transition: 'background 0.2s',
        }}>
          {selectedRowKeys.length > 0 ? (
            <>
              <span style={{
                fontSize: 12, fontWeight: 600, color: p.accent,
                padding: '3px 10px', borderRadius: 5, background: `${p.accent}15`,
              }}>
                {selectedRowKeys.length} selected
              </span>
              <button onClick={() => setSelectedRowKeys([])} style={ghostBtn()}>
                Deselect
              </button>
              <div style={{ width: 1, height: 20, background: p.cardBorder, margin: '0 4px' }} />
              <button onClick={handleBulkDelete} style={ghostBtn(p.red)}>
                <DeleteOutlined /> Delete
              </button>
              <button onClick={() => handleBulkToggle(true)} style={ghostBtn(p.green)}>
                <CheckCircleOutlined /> Enable
              </button>
              <button onClick={() => handleBulkToggle(false)} style={ghostBtn(p.amber)}>
                <StopOutlined /> Disable
              </button>
              <div style={{ flex: 1 }} />
            </>
          ) : (
            <>
              <div style={{ flex: 1 }} />
              <Input
                placeholder="Search name or command"
                prefix={<SearchOutlined style={{ color: p.textDim }} />}
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                allowClear
                style={{ width: 220 }}
                size="middle"
              />
              <Tooltip title="Refresh">
                <button
                  onClick={fetchJobs}
                  style={{
                    padding: '5px 10px', borderRadius: 6,
                    border: `1px solid ${p.cardBorder}`,
                    background: 'transparent', color: p.textMuted,
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
                    transition: 'all 0.15s',
                  }}
                >
                  <ReloadOutlined />
                </button>
              </Tooltip>
            </>
          )}
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────── */}
      {activeTab === 'jobs' && (
        <div>
          <Table
            columns={isMobile ? columns.filter(c => !['last_run', 'command'].includes(c.key)) : columns}
            dataSource={filteredJobs}
            rowKey="id"
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys),
            }}
            loading={{ spinning: loading, indicator: <Spin /> }}
            size="middle"
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              size: 'small',
              showTotal: (total) => <span style={{ fontSize: 12, color: p.textMuted }}>{total} jobs</span>,
            }}
            scroll={{ x: 600 }}
            style={{
              // Consistent with Websites table styling
            }}
          />
        </div>
      )}

      {activeTab === 'templates' && (
        <div style={{ padding: 20 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}>
            {CRON_TEMPLATES.map((tpl) => (
              <div
                key={tpl.name}
                onClick={() => openCreate(tpl)}
                style={{
                  padding: 18, borderRadius: 10,
                  border: `1px solid ${p.cardBorder}`,
                  background: isDark ? p.rowAlt : p.headerBg,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = `${p.accent}60`;
                  (e.currentTarget as HTMLDivElement).style.boxShadow = `0 2px 8px ${p.accent}15`;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = p.cardBorder;
                  (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                }}
              >
                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: tpl.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 17, flexShrink: 0,
                  }}>
                    {tpl.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: p.text, fontSize: 13, lineHeight: 1.3 }}>{tpl.name}</div>
                    <div style={{ fontSize: 11, color: p.textMuted, marginTop: 2, lineHeight: 1.4 }}>{tpl.description}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Tooltip title={`Cron: ${tpl.schedule}`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ClockCircleOutlined style={{ color: p.accent, fontSize: 11 }} />
                      <span style={{ fontSize: 11, color: p.textMuted }}>{cronToHuman(tpl.schedule)}</span>
                    </div>
                  </Tooltip>
                  <button onClick={(e) => { e.stopPropagation(); openCreate(tpl); }} style={{
                    padding: '3px 10px', borderRadius: 6,
                    border: 'none', cursor: 'pointer',
                    background: p.accent, color: '#fff',
                    fontSize: 11, fontWeight: 600, transition: 'opacity 0.15s',
                  }}>+ Use</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Add/Edit Modal ─────────────────────────────────────────── */}
      <Modal
        title={editingJob ? 'Edit Cron Job' : 'Add Cron Job'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditingJob(null); setCurrentTemplate(null); setMaxKeep(null); setStorageType('local'); setStorageId(null); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={submitting}
        width={isMobile ? '95%' : 600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ type: 'shell' }}>
          <Form.Item name="name" label={t('common.name')} rules={[{ required: true }]}>
            <Input placeholder="Backup database" />
          </Form.Item>
          <Form.Item name="type" label={t('common.type')} rules={[{ required: true }]}>
            <Select options={[{ label: 'Shell Command', value: 'shell' }, { label: 'URL (wget/curl)', value: 'url' }]} />
          </Form.Item>

          <Form.Item label="Schedule" required>
            <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
              {([
                { key: 'builder' as const, label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><ClockCircleOutlined style={{ fontSize: 11 }} /> Visual Builder</span> },
                { key: 'custom' as const, label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><SettingOutlined style={{ fontSize: 11 }} /> Cron Expression</span> },
              ]).map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSchedMode(tab.key)}
                  style={{
                    padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 500,
                    background: schedMode === tab.key ? `${p.accent}15` : 'transparent',
                    color: schedMode === tab.key ? p.accent : p.textMuted,
                    transition: 'all 0.15s',
                  }}
                >{tab.label}</button>
              ))}
            </div>
            {schedMode === 'builder' && scheduleBuilder}
            {schedMode === 'custom' && (
              <div>
                <Form.Item name="schedule" noStyle rules={schedMode === 'custom' ? [{ required: true, message: 'Enter cron expression' }] : []}>
                  <Input placeholder="* * * * *" />
                </Form.Item>
                <div style={{ fontSize: 11, color: p.textMuted, marginTop: 8, lineHeight: 1.6 }}>
                  minute(0-59) hour(0-23) day(1-31) month(1-12) weekday(0-7)
                </div>
              </div>
            )}
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev: Record<string, string>, cur: Record<string, string>) => prev.type !== cur.type}
          >
            {({ getFieldValue }: { getFieldValue: (name: string) => string }) =>
              getFieldValue('type') === 'url' ? (
                <Form.Item name="command" label="URL" rules={[{ required: true, type: 'url' }]}>
                  <Input placeholder="https://example.com/cron-endpoint" />
                </Form.Item>
              ) : (
                <Form.Item name="command" label="Command" rules={[{ required: true }]}>
                  <Input.TextArea rows={3} placeholder="/usr/bin/php /var/www/artisan schedule:run" />
                </Form.Item>
              )
            }
          </Form.Item>

          {/* Max-Keep & Storage — shown for ALL shell cron jobs */}
          <Form.Item
            noStyle
            shouldUpdate={(prev: Record<string, string>, cur: Record<string, string>) => prev.type !== cur.type}
          >
            {({ getFieldValue }: { getFieldValue: (name: string) => string }) =>
              getFieldValue('type') !== 'url' ? (
                <div style={{
                  padding: '12px 16px', borderRadius: 8, marginBottom: 16,
                  border: `1px solid ${p.cardBorder}`,
                  background: isDark ? p.rowAlt : p.headerBg,
                }}>
                  {/* Max-Keep row */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, color: p.text, fontSize: 13 }}>Max Backups to Keep</span>
                    </div>
                    <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 8 }}>
                      Automatically delete old backups when exceeding this limit. Set empty or 0 to keep all.
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <InputNumber
                        placeholder="No limit"
                        min={0} max={999}
                        value={maxKeep ?? undefined}
                        onChange={(v) => setMaxKeep(v ?? null)}
                        style={{ width: 120 }}
                      />
                      {(maxKeep !== null && maxKeep > 0) && (
                        <span style={{ fontSize: 11, color: p.green }}>
                          ✓ Will auto-delete oldest backups when count exceeds {maxKeep}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Site picker — only for backup templates */}
                  {(currentTemplate?.needsSitePicker || (editingJob !== null && detectBackupTemplate(editingJob.command)?.type === 'site')) && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, color: p.text, marginBottom: 6 }}>Select website:</div>
                      <Select
                        placeholder="Choose a website"
                        value={selectedTarget || undefined}
                        onChange={(v) => setSelectedTarget(v)}
                        style={{ width: '100%' }}
                        showSearch
                        filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                        options={sitesList.map(s => ({ label: s.domain, value: s.domain }))}
                        notFoundContent={sitesList.length === 0 ? 'No sites found' : undefined}
                      />
                    </div>
                  )}

                  {/* Database picker — only for backup templates */}
                  {(currentTemplate?.needsDbPicker || (editingJob !== null && detectBackupTemplate(editingJob.command)?.type === 'database')) && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, color: p.text, marginBottom: 6 }}>Select database:</div>
                      <Select
                        placeholder="Choose a database"
                        value={selectedTarget || undefined}
                        onChange={(v) => setSelectedTarget(v)}
                        style={{ width: '100%' }}
                        showSearch
                        filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                        options={dbsList.map(d => ({ label: d.name, value: d.name }))}
                        notFoundContent={dbsList.length === 0 ? 'No databases found' : undefined}
                      />
                    </div>
                  )}

                  {/* Storage destination */}
                  <div>
                    <div style={{ fontSize: 12, color: p.text, marginBottom: 6 }}>Storage destination:</div>
                    <Select
                      value={storageType}
                      onChange={(v: string) => {
                        setStorageType(v);
                        if (v === 'local') {
                          setStorageId(null);
                        } else {
                          const parts = v.split(':');
                          setStorageId(parseInt(parts[1]));
                        }
                      }}
                      style={{ width: '100%' }}
                      options={storageOptions}
                    />
                    {storageType !== 'local' && (
                      <div style={{ fontSize: 11, color: p.amber, marginTop: 6 }}>
                        ⬆ Backup will be stored locally and uploaded to remote storage
                      </div>
                    )}
                    {storageOptions.length <= 1 && (
                      <div style={{ fontSize: 11, color: p.textDim, marginTop: 6 }}>
                        Install and configure storage providers in Storage page to enable remote backup
                      </div>
                    )}
                  </div>

                  {/* CLI backup notice */}
                  {currentTemplate?.cliBackupType && (
                    <div style={{
                      fontSize: 11, color: p.textMuted, marginTop: 10,
                      padding: '6px 10px', borderRadius: 6, background: `${p.accent}08`,
                      border: `1px solid ${p.accent}20`,
                    }}>
                      <InfoCircleOutlined style={{ fontSize: 12, color: p.accent, flexShrink: 0 }} /> Backups are created via panel CLI and registered in the panel database — they will appear on the Websites/Databases page backup counts.
                    </div>
                  )}
                </div>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Log Modal ──────────────────────────────────────────────── */}
      <Modal
        title={`Log — ${logJobName}`}
        open={logOpen}
        onCancel={() => setLogOpen(false)}
        footer={null}
        width={isMobile ? '95%' : 700}
      >
        <pre style={{
          background: isDark ? '#0D1117' : '#1e1e1e',
          color: isDark ? '#E2E8F0' : '#d4d4d4',
          padding: 16, borderRadius: 8,
          maxHeight: '60vh', overflow: 'auto',
          fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          border: `1px solid ${p.cardBorder}`,
          margin: 0,
        }}>
          {logLoading ? t('common.loading') : logContent}
        </pre>
      </Modal>
    </div>
  );
}
