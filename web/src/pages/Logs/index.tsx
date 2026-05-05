import { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Input, Select, Popconfirm, Tooltip, message, Tag, DatePicker, Modal, Form } from 'antd';
import {
  ReloadOutlined, SearchOutlined, ClearOutlined, InfoCircleOutlined,
  WarningOutlined, BugOutlined, CloseCircleOutlined, GlobalOutlined,
  RightOutlined, LeftOutlined, BarChartOutlined,
  FileTextOutlined, ExclamationCircleOutlined, CalendarOutlined,
  StopOutlined, PlusOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePalette } from '@/hooks/usePalette';
import type { Palette } from '@/hooks/usePalette';
import type { ApiResponse } from '@/types';
import api from '@/services/api';
import dayjs from 'dayjs';

/* ─── Types ─── */

interface AuditEntry {
  id: number;
  user: string;
  action: string;
  resource: string;
  ip: string;
  created_at: string;
}

interface ParsedLog {
  key: number;
  raw: string;
  level: string;
  time: string;
  message: string;
  method?: string;
  path?: string;
  status?: number;
  duration?: number;
  ip?: string;
  error?: string;
  extra: Record<string, unknown>;
}

interface ParsedAccessLog {
  key: number;
  raw: string;
  ip: string;
  time: string;
  method: string;
  path: string;
  status: number;
  size: number;
  referer: string;
  userAgent: string;
  latency?: number;
}

interface SiteMinimal { id: number; domain: string; }

/* ─── Parsers ─── */

// Parse nginx combined log format:
// 192.168.1.1 - - [24/Mar/2026:12:00:00 +0700] "GET /path HTTP/1.1" 200 1234 "referer" "user-agent"
// Also supports: with latency (ms) at end, or without referer, or with custom fields
function parseAccessLogLine(raw: string, idx: number): ParsedAccessLog {
  // Try nginx combined log format (most common)
  const m = raw.match(
    /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s+\S+"\s+(\d+)\s+(\d+)\s+"([^"]*)"\s+"([^"]*)"/
  );
  if (m) {
    return {
      key: idx, raw, ip: m[1], time: m[2], method: m[3], path: m[4],
      status: parseInt(m[5], 10), size: parseInt(m[6], 10), referer: m[7], userAgent: m[8],
    };
  }

  // Try format with latency: ... status size latency "referer" "ua"
  const m2 = raw.match(
    /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s+\S+"\s+(\d+)\s+(\d+)\s+(\d+|-)\s+"([^"]*)"\s+"([^"]*)"/
  );
  if (m2) {
    return {
      key: idx, raw, ip: m2[1], time: m2[2], method: m2[3], path: m2[4],
      status: parseInt(m2[5], 10), size: parseInt(m2[6], 10),
      latency: m2[7] !== '-' ? parseInt(m2[7], 10) : undefined,
      referer: m2[8], userAgent: m2[9],
    };
  }

  // Try format without referer: ... status size "ua"
  const m3 = raw.match(
    /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s+\S+"\s+(\d+)\s+(\d+)\s+"([^"]*)"/
  );
  if (m3) {
    return {
      key: idx, raw, ip: m3[1], time: m3[2], method: m3[3], path: m3[4],
      status: parseInt(m3[5], 10), size: parseInt(m3[6], 10),
      referer: '', userAgent: m3[7],
    };
  }

  // Try simple format: IP - - [time] "method path version" status size
  const m4 = raw.match(
    /^(\S+)\s+-\s+-\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s+\S+"\s+(\d+)\s+(\d+)/
  );
  if (m4) {
    return {
      key: idx, raw, ip: m4[1], time: m4[2], method: m4[3], path: m4[4],
      status: parseInt(m4[5], 10), size: parseInt(m4[6], 10),
      referer: '', userAgent: '',
    };
  }

  // Extract what we can from partial matches
  const ipMatch = raw.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
  const timeMatch = raw.match(/\[([^\]]+)\]/);
  const methodMatch = raw.match(/"(\S+)\s+(\/\S*)/);
  const statusMatch = raw.match(/\s(\d{3})\s/);
  const sizeMatch = raw.match(/\s(\d+)\s["\[]/);

  // If we found at least IP or time, show partial data with raw fallback
  if (ipMatch || timeMatch || methodMatch) {
    return {
      key: idx, raw,
      ip: ipMatch ? ipMatch[1] : '',
      time: timeMatch ? timeMatch[1] : '',
      method: methodMatch ? methodMatch[1] : '',
      path: methodMatch ? methodMatch[2] : '',
      status: statusMatch ? parseInt(statusMatch[1], 10) : 0,
      size: sizeMatch ? parseInt(sizeMatch[1], 10) : 0,
      referer: '',
      userAgent: '',
    };
  }

  // Fallback: show raw line with empty parsed fields but display raw as message
  return {
    key: idx, raw, ip: '', time: '', method: '', path: '',
    status: 0, size: 0, referer: '', userAgent: '',
  };
}

const LEVEL_COLOR: Record<string, { color: string; icon: React.ReactNode }> = {
  debug: { color: '#8b949e', icon: <BugOutlined /> },
  info:  { color: '#58a6ff', icon: <InfoCircleOutlined /> },
  warn:  { color: '#d29922', icon: <WarningOutlined /> },
  error: { color: '#f85149', icon: <CloseCircleOutlined /> },
  fatal: { color: '#f85149', icon: <CloseCircleOutlined /> },
};

const HIDDEN_KEYS = new Set(['level', 'time', 'message', 'caller', 'method', 'path', 'status', 'duration', 'ip', 'error', 'size']);

function parseLogLine(raw: string, idx: number): ParsedLog {
  try {
    const obj = JSON.parse(raw);
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!HIDDEN_KEYS.has(k)) extra[k] = v;
    }
    return {
      key: idx, raw,
      level: obj.level || 'info',
      time: obj.time || '',
      message: obj.message || '',
      method: obj.method, path: obj.path,
      status: obj.status, duration: obj.duration,
      ip: obj.ip, error: obj.error, extra,
    };
  } catch {
    return { key: idx, raw, level: 'info', time: '', message: raw, extra: {} };
  }
}

function formatTime(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  } catch {
    return iso;
  }
}

/* ─── Helpers ─── */

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function statusGroup(s: number): string {
  if (s >= 500) return '5xx';
  if (s >= 400) return '4xx';
  if (s >= 300) return '3xx';
  return '2xx';
}

function topN<T>(items: T[], key: (item: T) => string, n: number): { value: string; count: number }[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k) map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([value, count]) => ({ value, count }));
}

/* ─── Shared Components ─── */

function StatusBadge({ status, p }: { status?: number; p: Palette }) {
  if (status == null) return null;
  const color = status >= 500 ? p.red : status >= 400 ? p.amber : status >= 300 ? p.accent : p.green;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 4,
      background: `${color}15`, color, fontSize: 11, fontWeight: 500,
    }}>{status}</span>
  );
}

function MetricCard({ value, label, color, p, isDark }: {
  value: React.ReactNode; label: string; color?: string; p: Palette; isDark: boolean;
}) {
  return (
    <div style={{
      padding: '12px 16px', borderRadius: 8,
      background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      border: `1px solid ${p.cardBorder}`,
      flex: 1, minWidth: 120,
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || p.text }}>{value}</div>
      <div style={{ fontSize: 11, color: p.textMuted }}>{label}</div>
    </div>
  );
}

function ToggleBtn({ active, color, label, onClick, p }: {
  active: boolean; color: string; label: string; onClick: () => void; p: Palette;
}) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
      border: `1px solid ${active ? color : `${color}40`}`,
      background: active ? `${color}22` : 'transparent',
      color: active ? color : `${color}90`,
      cursor: 'pointer', transition: 'all 0.15s',
      opacity: active ? 1 : 0.7,
    }}>{label}</button>
  );
}

function DistributionBar({ segments, p }: {
  segments: { color: string; pct: number; label: string }[]; p: Palette;
}) {
  return (
    <Tooltip title={
      <div>{segments.map((s, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />
          {s.label}: {s.pct.toFixed(1)}%
        </div>
      ))}</div>
    }>
      <div style={{
        display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden',
        background: p.barTrack, width: '100%',
      }}>
        {segments.filter(s => s.pct > 0).map((s, i) => (
          <div key={i} style={{ width: `${s.pct}%`, background: s.color, minWidth: s.pct > 0 ? 2 : 0 }} />
        ))}
      </div>
    </Tooltip>
  );
}

function RankList({ items, maxCount, color, p, onClickItem, onBlockItem }: {
  items: { value: string; count: number }[]; maxCount: number; color: string;
  p: Palette; onClickItem?: (v: string) => void; onBlockItem?: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map((item, i) => (
        <div key={i}
          onClick={() => onClickItem?.(item.value)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
            cursor: onClickItem ? 'pointer' : 'default',
            padding: '3px 6px', borderRadius: 4,
          }}
        >
          <span style={{ color: p.textDim, width: 14, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{
                color: p.text, fontFamily: 'monospace', fontSize: 11,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{item.value}</span>
              <span style={{ color: p.textMuted, flexShrink: 0, marginLeft: 8 }}>{item.count}</span>
            </div>
            <div style={{
              height: 3, borderRadius: 2, background: p.barTrack, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 2, background: color,
                width: `${maxCount > 0 ? (item.count / maxCount) * 100 : 0}%`,
                transition: 'width 0.3s',
              }} />
            </div>
          </div>
          {onBlockItem && (
            <Tooltip title={`Block ${item.value}`}>
              <button
                onClick={(e) => { e.stopPropagation(); onBlockItem(item.value); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: p.red, padding: '2px 3px', display: 'flex', alignItems: 'center',
                  borderRadius: 3, opacity: 0.5, flexShrink: 0,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.5'; }}
              >
                <StopOutlined style={{ fontSize: 11 }} />
              </button>
            </Tooltip>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Main Component ─── */

export default function Logs() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();

  // Core state
  const [panelLines, setPanelLines] = useState<string[]>([]);
  const [sshLines, setSshLines] = useState<string[]>([]);
  const [auditData, setAuditData] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState(200);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('panel');
  const [levelFilter, setLevelFilter] = useState<string>('all');

  // Panel log filters
  const [durationFilter, setDurationFilter] = useState<number>(0);

  // Website logs state
  const [sites, setSites] = useState<SiteMinimal[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [websiteLogType, setWebsiteLogType] = useState<'access' | 'error'>('access');
  const [websiteLines, setWebsiteLines] = useState<string[]>([]);
  const [logDateRange, setLogDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  // Website log filters
  const [wsStatusFilters, setWsStatusFilters] = useState<Set<string>>(new Set(['2xx', '3xx', '4xx', '5xx']));
  const [wsMethodFilters, setWsMethodFilters] = useState<Set<string>>(new Set());
  const [wsIpFilter, setWsIpFilter] = useState('');
  const [wsPathFilter, setWsPathFilter] = useState('');
  const [wsSidePanelOpen, setWsSidePanelOpen] = useState(false);
  const [wsExpandedRows, setWsExpandedRows] = useState<Set<number>>(new Set());

  // SSH IP filter
  const [sshIpFilter, setSshIpFilter] = useState('');

  // Block IP from logs
  const [blockIPModalOpen, setBlockIPModalOpen] = useState(false);
  const [blockIPValue, setBlockIPValue] = useState('');
  const [blockIPLoading, setBlockIPLoading] = useState(false);
  const [blockIPForm] = Form.useForm();

  const handleBlockIPFromLog = async () => {
    if (!blockIPValue.trim()) return;
    setBlockIPLoading(true);
    try {
      await api.post('/firewall/blocked-ips', { ip: blockIPValue.trim() });
      message.success(`IP ${blockIPValue} blocked successfully`);
      setBlockIPModalOpen(false);
      setBlockIPValue('');
      blockIPForm.resetFields();
    } catch {
      message.error('Failed to block IP. Is the firewall installed?');
    } finally {
      setBlockIPLoading(false);
    }
  };

  /* ─── API Calls (unchanged) ─── */

  const fetchPanelLog = useCallback(async (numLines: number) => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<{ lines: string | string[] }>>('/logs/panel', { params: { lines: numLines } });
      const raw = data.data?.lines;
      if (Array.isArray(raw)) setPanelLines(raw);
      else if (typeof raw === 'string') setPanelLines(raw.split('\n').filter(Boolean));
      else setPanelLines([]);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchSshLog = useCallback(async (numLines: number) => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<{ lines: string | string[] }>>('/logs/ssh', { params: { lines: numLines } });
      const raw = data.data?.lines;
      if (Array.isArray(raw)) setSshLines(raw);
      else if (typeof raw === 'string') setSshLines(raw.split('\n').filter(Boolean));
      else setSshLines([]);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchAuditLog = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<AuditEntry[]>>('/logs/audit');
      setAuditData(data.data ?? []);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchSites = useCallback(async () => {
    try {
      const { data } = await api.get<ApiResponse<SiteMinimal[]>>('/logs/sites');
      const list = data.data ?? [];
      setSites(list);
      if (list.length > 0 && !selectedSiteId) setSelectedSiteId(list[0].id);
    } catch { /* ignore */ }
  }, [selectedSiteId]);

  // Backend stats for all log lines
  interface BackendStats {
    total_requests: number;
    unique_ips: number;
    total_bytes: number;
    status_2xx: number;
    status_3xx: number;
    status_4xx: number;
    status_5xx: number;
    top_status: number;
    top_status_count: number;
    top_ips?: { ip: string; count: number }[];
  }
  const [wsBackendStats, setWsBackendStats] = useState<BackendStats | null>(null);

  // GeoIP data for IPs
  interface GeoInfo {
    ip: string;
    country: string;
    country_code: string;
    region: string;
    city: string;
    isp: string;
  }
  const [wsGeoData, setWsGeoData] = useState<Record<string, GeoInfo>>({});

  // Country code to flag emoji
  const countryToFlag = (code: string): string => {
    if (!code || code.length !== 2) return '';
    return code.toUpperCase().split('').map(c => String.fromCodePoint(127397 + c.charCodeAt(0))).join('');
  };

  const fetchWebsiteLog = useCallback(async (siteId: number, logType: 'access' | 'error', numLines: number, dateRange: [dayjs.Dayjs, dayjs.Dayjs] | null) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { lines: numLines, geo: 'true' };
      if (dateRange) {
        params.start_date = dateRange[0].format('YYYY-MM-DD');
        params.end_date = dateRange[1].format('YYYY-MM-DD');
      }
      const { data } = await api.get<ApiResponse<{ lines: string | string[], total_lines?: number, stats?: BackendStats, geo?: Record<string, GeoInfo> }>>(`/logs/website/${siteId}/${logType}`, { params });
      const raw = data.data?.lines;
      if (Array.isArray(raw)) setWebsiteLines(raw);
      else if (typeof raw === 'string') setWebsiteLines(raw.split('\n').filter(Boolean));
      else setWebsiteLines([]);
      setWsBackendStats(data.data?.stats ?? null);
      setWsGeoData(data.data?.geo ?? {});
    } catch {
      setWebsiteLines([]);
      setWsBackendStats(null);
      setWsGeoData({});
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    if (activeTab === 'panel') fetchPanelLog(lines);
    else if (activeTab === 'ssh') fetchSshLog(lines);
    else if (activeTab === 'website') {
      if (selectedSiteId) fetchWebsiteLog(selectedSiteId, websiteLogType, lines, logDateRange);
    }
    else fetchAuditLog();
  }, [activeTab, lines, fetchPanelLog, fetchSshLog, fetchAuditLog, fetchWebsiteLog, selectedSiteId, websiteLogType, logDateRange]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (activeTab === 'website' && sites.length === 0) fetchSites();
  }, [activeTab, sites.length, fetchSites]);

  const handleClearLog = async () => {
    try {
      if (activeTab === 'website') {
        if (!selectedSiteId) return;
        await api.delete(`/logs/website/${selectedSiteId}/${websiteLogType}`);
      } else if (activeTab === 'panel') {
        await api.delete('/logs/panel');
      } else if (activeTab === 'ssh') {
        await api.delete('/logs/ssh');
      } else {
        return;
      }
      message.success(t('common.success'));
      refresh();
    } catch {
      message.error(t('common.error'));
    }
  };

  const clearLogLabel = useMemo(() => {
    if (activeTab === 'website') {
      const site = sites.find(s => s.id === selectedSiteId);
      return `Clear ${websiteLogType} log of ${site?.domain ?? 'this site'}?`;
    }
    if (activeTab === 'panel') return 'Clear panel log?';
    if (activeTab === 'ssh') return 'Clear SSH log?';
    return '';
  }, [activeTab, websiteLogType, selectedSiteId, sites]);

  /* ─── Parsed & Filtered Data ─── */

  const currentLines = activeTab === 'panel' ? panelLines : sshLines;
  const parsed = useMemo(() => currentLines.map((l, i) => parseLogLine(l, i)).reverse(), [currentLines]);

  const filtered = useMemo(() => {
    let data = parsed;
    if (levelFilter !== 'all') {
      data = data.filter((l) => l.level === levelFilter);
    }
    if (durationFilter > 0 && activeTab === 'panel') {
      data = data.filter((l) => l.duration != null && l.duration > durationFilter);
    }
    if (sshIpFilter && activeTab === 'ssh') {
      data = data.filter((l) => {
        const m = l.raw.match(/(?:from|for)\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
        return m && m[1] === sshIpFilter;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter((l) =>
        l.message.toLowerCase().includes(q) ||
        (l.path || '').toLowerCase().includes(q) ||
        (l.ip || '').toLowerCase().includes(q) ||
        (l.error || '').toLowerCase().includes(q) ||
        l.raw.toLowerCase().includes(q)
      );
    }
    return data;
  }, [parsed, levelFilter, search, durationFilter, activeTab, sshIpFilter]);

  // Panel stats
  const panelStats = useMemo(() => {
    const total = parsed.length;
    let errors = 0, warns = 0, infos = 0, debugs = 0;
    let durationSum = 0, durationCount = 0;
    for (const log of parsed) {
      if (log.level === 'error' || log.level === 'fatal') errors++;
      else if (log.level === 'warn') warns++;
      else if (log.level === 'info') infos++;
      else if (log.level === 'debug') debugs++;
      if (log.duration != null) { durationSum += log.duration; durationCount++; }
    }
    const avgDuration = durationCount > 0 ? durationSum / durationCount : 0;
    return { total, errors, warns, infos, debugs, avgDuration, durationCount };
  }, [parsed]);

  // SSH stats
  const sshStats = useMemo(() => {
    let total = 0, failed = 0, accepted = 0;
    const ipSet = new Set<string>();
    const failedIps = new Map<string, number>();
    for (const log of parsed) {
      total++;
      const raw = log.raw.toLowerCase();
      const ipMatch = log.raw.match(/(?:from|for)\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      if (ipMatch) ipSet.add(ipMatch[1]);
      if (raw.includes('failed') || raw.includes('invalid') || raw.includes('error')) {
        failed++;
        if (ipMatch) failedIps.set(ipMatch[1], (failedIps.get(ipMatch[1]) || 0) + 1);
      }
      if (raw.includes('accepted') || raw.includes('opened')) accepted++;
    }
    const topAttackers = [...failedIps.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([ip, count]) => ({ value: ip, count }));
    return { total, failed, accepted, uniqueIps: ipSet.size, topAttackers };
  }, [parsed]);

  // Website parsed data
  const parsedWebsite = useMemo(() => websiteLines.map((l, i) => parseAccessLogLine(l, i)).reverse(), [websiteLines]);

  // Website stats (from full parsed data, before filters)
  const wsStats = useMemo(() => {
    const valid = parsedWebsite.filter(l => l.status > 0);
    const total = valid.length;
    const ipSet = new Set<string>();
    let totalSize = 0;
    let s2xx = 0, s3xx = 0, s4xx = 0, s5xx = 0;
    const statusCounts = new Map<number, number>();
    for (const l of valid) {
      if (l.ip) ipSet.add(l.ip);
      totalSize += l.size;
      const g = statusGroup(l.status);
      if (g === '2xx') s2xx++; else if (g === '3xx') s3xx++; else if (g === '4xx') s4xx++; else s5xx++;
      statusCounts.set(l.status, (statusCounts.get(l.status) || 0) + 1);
    }
    const errorRate = total > 0 ? ((s4xx + s5xx) / total) * 100 : 0;
    let topStatus = 0, topStatusCount = 0;
    for (const [code, cnt] of statusCounts) {
      if (cnt > topStatusCount) { topStatus = code; topStatusCount = cnt; }
    }
    return { total, uniqueIps: ipSet.size, totalSize, errorRate, topStatus, s2xx, s3xx, s4xx, s5xx };
  }, [parsedWebsite]);

  // Website filtered data
  const filteredWebsite = useMemo(() => {
    let data = parsedWebsite;
    if (websiteLogType === 'access') {
      // Status filter
      if (wsStatusFilters.size < 4) {
        data = data.filter(l => l.status === 0 || wsStatusFilters.has(statusGroup(l.status)));
      }
      // Method filter
      if (wsMethodFilters.size > 0) {
        data = data.filter(l => !l.method || wsMethodFilters.has(l.method));
      }
      // IP filter
      if (wsIpFilter.trim()) {
        const q = wsIpFilter.trim().toLowerCase();
        data = data.filter(l => l.ip.toLowerCase().includes(q));
      }
      // Path filter
      if (wsPathFilter.trim()) {
        const q = wsPathFilter.trim().toLowerCase();
        data = data.filter(l => l.path.toLowerCase().includes(q));
      }
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(l =>
        l.ip.toLowerCase().includes(q) ||
        l.path.toLowerCase().includes(q) ||
        l.method.toLowerCase().includes(q) ||
        l.userAgent.toLowerCase().includes(q) ||
        l.raw.toLowerCase().includes(q)
      );
    }
    return data;
  }, [parsedWebsite, search, websiteLogType, wsStatusFilters, wsMethodFilters, wsIpFilter, wsPathFilter]);

  // Website side panel data
  const wsTopIps = useMemo(() => topN(filteredWebsite, l => l.ip, 10), [filteredWebsite]);
  const wsTopPaths = useMemo(() => topN(filteredWebsite, l => l.path, 10), [filteredWebsite]);

  // Audit stats
  const auditStats = useMemo(() => {
    const actionCounts = new Map<string, number>();
    for (const entry of auditData) {
      const a = entry.action || 'unknown';
      actionCounts.set(a, (actionCounts.get(a) || 0) + 1);
    }
    return {
      total: auditData.length,
      actions: [...actionCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([action, count]) => ({ action, count })),
    };
  }, [auditData]);

  const isJsonLog = currentLines.length > 0 && currentLines[0]?.startsWith('{');

  /* ─── Column Definitions ─── */

  const logColumns = [
    {
      title: 'Time', dataIndex: 'time', key: 'time', width: isMobile ? 80 : 110,
      sorter: (a: ParsedLog, b: ParsedLog) => a.time.localeCompare(b.time),
      defaultSortOrder: 'descend' as const,
      render: (v: string) => <span style={{ fontSize: 12, color: p.textMuted }}>{formatTime(v)}</span>,
    },
    {
      title: 'Level', dataIndex: 'level', key: 'level', width: 80,
      render: (v: string) => {
        const cfg = LEVEL_COLOR[v] || LEVEL_COLOR.info;
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 4,
            background: `${cfg.color}15`, color: cfg.color,
            fontSize: 11, fontWeight: 500,
          }}>
            {cfg.icon} {v.toUpperCase()}
          </span>
        );
      },
    },
    {
      title: 'Message', key: 'message', ellipsis: true,
      render: (_: unknown, r: ParsedLog) => (
        <div style={{ whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: p.text }}>{r.message}</span>
          {r.method && r.path && (
            <span style={{ marginLeft: 8 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 4,
                background: `${p.accent}15`, color: p.accent, fontSize: 11, fontWeight: 500,
              }}>{r.method}</span>{' '}
              <span style={{ fontSize: 12, color: p.textMuted, background: p.codeBg, padding: '1px 5px', borderRadius: 3 }}>{r.path}</span>
              {r.status != null && <>{' '}<StatusBadge status={r.status} p={p} /></>}
              {r.duration != null && <span style={{ fontSize: 11, color: p.textMuted, marginLeft: 4 }}>{r.duration.toFixed(1)}ms</span>}
            </span>
          )}
          {r.error && <div><span style={{ fontSize: 12, color: p.red }}>{r.error}</span></div>}
          {Object.keys(r.extra).length > 0 && (
            <div style={{ marginTop: 2 }}>
              {Object.entries(r.extra).map(([k, v]) => (
                <Tooltip key={k} title={JSON.stringify(v)}>
                  <span style={{
                    display: 'inline-block', fontSize: 11,
                    margin: '1px 4px 1px 0', padding: '1px 6px', borderRadius: 3,
                    background: p.codeBg, color: p.textMuted,
                  }}>{k}={typeof v === 'string' ? v : JSON.stringify(v)}</span>
                </Tooltip>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'IP', dataIndex: 'ip', key: 'ip', width: isMobile ? 90 : 120,
      render: (v?: string) => v ? <span style={{ fontSize: 12, color: p.textMuted }}>{v}</span> : null,
    },
  ];

  const sshPlainColumns = [
    {
      title: 'Time', key: 'time', width: isMobile ? 80 : 140,
      sorter: (a: ParsedLog, b: ParsedLog) => a.key - b.key,
      defaultSortOrder: 'descend' as const,
      render: (_: unknown, record: ParsedLog) => {
        const m = record.raw.match(/^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})/);
        return <span style={{ fontSize: 11, color: p.textMuted, whiteSpace: 'nowrap' }}>{m ? m[1] : ''}</span>;
      },
    },
    {
      title: 'Source', key: 'source', width: isMobile ? 80 : 120,
      render: (_: unknown, record: ParsedLog) => {
        const m = record.raw.match(/^\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\S+\s+(\S+?)[\[:]/);
        const src = m ? m[1] : '';
        return src ? (
          <span style={{
            fontSize: 11, padding: '1px 7px', borderRadius: 4,
            background: `${p.accent}12`, color: p.accent, fontWeight: 500,
          }}>{src}</span>
        ) : null;
      },
    },
    {
      title: 'Event', key: 'event', width: isMobile ? 60 : 90,
      render: (_: unknown, record: ParsedLog) => {
        const raw = record.raw.toLowerCase();
        let label = '';
        let color = p.textMuted;
        if (raw.includes('accepted') || raw.includes('opened')) { label = 'Accept'; color = p.green; }
        else if (raw.includes('failed') || raw.includes('invalid') || raw.includes('error')) { label = 'Failed'; color = p.red; }
        else if (raw.includes('disconnect') || raw.includes('closed')) { label = 'Close'; color = p.amber; }
        else if (raw.includes('connection from') || raw.includes('new connection')) { label = 'Connect'; color = p.accent; }
        if (!label) return null;
        return (
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
            background: `${color}15`, color,
          }}>{label}</span>
        );
      },
    },
    {
      title: 'Message', dataIndex: 'raw', key: 'raw',
      render: (v: string) => {
        const stripped = v.replace(/^\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\S+\s+\S+?\[\d+\]:\s*/, '')
                          .replace(/^\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\S+\s+\S+:\s*/, '');
        const text = stripped || v;
        if (!search.trim()) return <span style={{ fontSize: 12, color: p.text, lineHeight: 1.5 }}>{text}</span>;
        const parts = text.split(new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
        return (
          <span style={{ fontSize: 12, color: p.text, lineHeight: 1.5 }}>
            {parts.map((part, i) =>
              part.toLowerCase() === search.toLowerCase()
                ? <span key={i} style={{ background: p.amber, color: '#000', borderRadius: 2, padding: '0 2px' }}>{part}</span>
                : part
            )}
          </span>
        );
      },
    },
    {
      title: 'IP', key: 'ip_addr', width: isMobile ? 90 : 160,
      render: (_: unknown, record: ParsedLog) => {
        const m = record.raw.match(/(?:from|for)\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
        return m ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span
              onClick={() => setSshIpFilter(m[1])}
              style={{ fontSize: 11, color: p.accent, cursor: 'pointer', borderBottom: `1px dashed ${p.accent}` }}
            >{m[1]}</span>
            {!isMobile && (
              <Tooltip title={`Block ${m[1]}`}>
                <button
                  onClick={(e) => { e.stopPropagation(); setBlockIPValue(m[1]); setBlockIPModalOpen(true); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: p.red, padding: '1px 3px', display: 'flex', alignItems: 'center',
                    borderRadius: 3, opacity: 0.6,
                    transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '1'; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '0.6'; }}
                >
                  <StopOutlined style={{ fontSize: 12 }} />
                </button>
              </Tooltip>
            )}
          </span>
        ) : null;
      },
    },
  ];

  const auditColumns = [
    {
      title: 'Time', dataIndex: 'created_at', key: 'created_at', width: isMobile ? 100 : 160,
      sorter: (a: AuditEntry, b: AuditEntry) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      defaultSortOrder: 'descend' as const,
      render: (val: string) => {
        if (!val) return <span style={{ color: p.textDim }}>—</span>;
        const d = new Date(val);
        return (
          <div style={{ fontSize: 12, lineHeight: 1.5 }}>
            <div style={{ color: p.text, fontWeight: 500 }}>{d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            <div style={{ color: p.textMuted, fontSize: 11 }}>{d.toLocaleTimeString('en-GB', { hour12: false })}</div>
          </div>
        );
      },
    },
    {
      title: 'User', dataIndex: 'user', key: 'user', width: isMobile ? 80 : 120,
      render: (val: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 6,
            background: `${p.accent}15`, color: p.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, flexShrink: 0,
          }}>{(val || '?')[0].toUpperCase()}</div>
          <span style={{ fontSize: 13, fontWeight: 500, color: p.text }}>{val}</span>
        </div>
      ),
    },
    {
      title: 'Action', dataIndex: 'action', key: 'action', width: isMobile ? 80 : 140,
      render: (val: string) => {
        const lower = (val || '').toLowerCase();
        let color = p.accent;
        if (lower.includes('create') || lower.includes('add') || lower.includes('install')) color = p.green;
        else if (lower.includes('delete') || lower.includes('remove') || lower.includes('uninstall')) color = p.red;
        else if (lower.includes('update') || lower.includes('edit') || lower.includes('change') || lower.includes('reset')) color = p.amber;
        else if (lower.includes('login') || lower.includes('logout') || lower.includes('auth')) color = p.purple;
        else if (lower.includes('start') || lower.includes('stop') || lower.includes('restart')) color = p.cyan;
        return (
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 5, fontWeight: 600,
            background: `${color}15`, color, display: 'inline-block',
          }}>{val}</span>
        );
      },
    },
    {
      title: 'Resource', dataIndex: 'resource', key: 'resource', ellipsis: true,
      render: (val: string) => <span style={{ fontSize: 12, color: p.text }}>{val || '—'}</span>,
    },
    {
      title: 'IP', dataIndex: 'ip', key: 'ip', width: isMobile ? 90 : 130,
      render: (v: string) => v ? (
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 4,
          background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          color: p.textMuted,
        }}>{v}</span>
      ) : <span style={{ color: p.textDim }}>—</span>,
    },
  ];

  // Website access log columns
  const websiteAccessColumns = useMemo(() => [
    {
      title: 'Time', dataIndex: 'time', key: 'time', width: isMobile ? 100 : 180,
      sorter: (a: ParsedAccessLog, b: ParsedAccessLog) => a.key - b.key,
      defaultSortOrder: 'descend' as const,
      render: (v: string, r: ParsedAccessLog) => {
        if (!v) return <span style={{ fontSize: 10, color: p.textDim, fontStyle: 'italic' }}>—</span>;
        return <span style={{ fontSize: 11, color: p.textMuted, whiteSpace: 'nowrap' }}>{v}</span>;
      },
    },
    {
      title: 'IP', dataIndex: 'ip', key: 'ip', width: isMobile ? 120 : 200,
      render: (v: string) => {
        if (!v) return <span style={{ fontSize: 10, color: p.textDim, fontStyle: 'italic' }}>—</span>;
        const geo = wsGeoData[v];
        const flag = geo?.country_code ? countryToFlag(geo.country_code) : null;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {flag && (
              <Tooltip title={geo.country || geo.country_code}>
                <span style={{ fontSize: 14 }}>{flag}</span>
              </Tooltip>
            )}
            <span
              onClick={(e) => { e.stopPropagation(); setWsIpFilter(v); }}
              style={{ fontSize: 11, color: p.textMuted, cursor: 'pointer', borderBottom: `1px dashed ${p.textDim}` }}
            >{v}</span>
            {!isMobile && (
              <Tooltip title={`Block ${v}`}>
                <button
                  onClick={(e) => { e.stopPropagation(); setBlockIPValue(v); setBlockIPModalOpen(true); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: p.red, padding: '1px 3px', display: 'flex', alignItems: 'center',
                    borderRadius: 3, opacity: 0.6,
                    transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '1'; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '0.6'; }}
                >
                  <StopOutlined style={{ fontSize: 12 }} />
                </button>
              </Tooltip>
            )}
          </span>
        );
      },
    },
    {
      title: 'Method', dataIndex: 'method', key: 'method', width: 90,
      render: (v: string) => {
        if (!v) return <span style={{ fontSize: 10, color: p.textDim, fontStyle: 'italic' }}>—</span>;
        const color = v === 'GET' ? p.green : v === 'POST' ? p.accent : v === 'DELETE' ? p.red : v === 'PUT' ? p.amber : v === 'PATCH' ? p.purple : p.textMuted;
        return (
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
            background: `${color}15`, color, whiteSpace: 'nowrap', display: 'inline-block',
          }}>{v}</span>
        );
      },
    },
    {
      title: 'Path', dataIndex: 'path', key: 'path', ellipsis: true,
      render: (v: string, r: ParsedAccessLog) => {
        if (!v) {
          // Show raw as fallback for unparseable lines
          return (
            <Tooltip title={
              <div>
                <div style={{ marginBottom: 4, color: p.amber }}>Could not parse log line</div>
                <code style={{ fontSize: 10, wordBreak: 'break-all' }}>{r.raw}</code>
              </div>
            }>
              <span style={{ fontSize: 11, color: p.amber, fontStyle: 'italic' }}>
                [raw] {r.raw.length > 50 ? r.raw.substring(0, 50) + '...' : r.raw}
              </span>
            </Tooltip>
          );
        }
        return <span style={{ fontSize: 12, color: p.text }}>{v}</span>;
      },
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 70,
      render: (v: number) => {
        if (!v) return <span style={{ fontSize: 10, color: p.textDim, fontStyle: 'italic' }}>—</span>;
        return <StatusBadge status={v} p={p} />;
      },
    },
    {
      title: 'Latency', dataIndex: 'latency', key: 'latency', width: 80,
      render: (v?: number) => {
        if (v == null) return <span style={{ fontSize: 10, color: p.textDim }}>—</span>;
        return (
          <span style={{
            fontSize: 11, color: v > 1000 ? p.red : v > 500 ? p.amber : p.textMuted,
          }}>
            {v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`}
          </span>
        );
      },
    },
    {
      title: 'Size', dataIndex: 'size', key: 'size', width: 80,
      render: (v: number) => {
        if (!v) return <span style={{ color: p.textDim }}>—</span>;
        return <span style={{ fontSize: 11, color: p.textMuted }}>{formatBytes(v)}</span>;
      },
    },
    ...(!isMobile ? [{
      title: 'User-Agent', dataIndex: 'userAgent', key: 'ua', ellipsis: true, width: 200,
      render: (v: string) => {
        if (!v || v === '-') return <span style={{ fontSize: 11, color: p.textDim }}>—</span>;
        return <span style={{ fontSize: 11, color: p.textDim }}>{v.length > 80 ? v.substring(0, 80) + '...' : v}</span>;
      },
    }] : []),
  ], [isMobile, p, wsGeoData]);

  // Website error log columns
  const websiteErrorColumns = [
    {
      title: 'Time', key: 'time', width: isMobile ? 100 : 180,
      sorter: (a: ParsedAccessLog, b: ParsedAccessLog) => a.key - b.key,
      defaultSortOrder: 'descend' as const,
      render: (_: unknown, r: ParsedAccessLog) => {
        const m = r.raw.match(/^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})/);
        return <span style={{ fontSize: 11, color: p.textMuted, whiteSpace: 'nowrap' }}>{m ? m[1] : ''}</span>;
      },
    },
    {
      title: 'Level', key: 'level', width: 70,
      render: (_: unknown, r: ParsedAccessLog) => {
        const m = r.raw.match(/\[(\w+)\]/);
        if (!m) return null;
        const lvl = m[1].toLowerCase();
        const color = lvl === 'error' || lvl === 'crit' || lvl === 'alert' || lvl === 'emerg' ? p.red
          : lvl === 'warn' ? p.amber : p.textMuted;
        return (
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
            background: `${color}15`, color,
          }}>{m[1]}</span>
        );
      },
    },
    {
      title: 'Message', key: 'message', ellipsis: true,
      render: (_: unknown, r: ParsedAccessLog) => {
        const cleaned = r.raw.replace(/^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\s+\[\w+\]\s+\d+#\d+:\s*(\*\d+\s+)?/, '');
        return <span style={{ fontSize: 12, color: p.text }}>{cleaned || r.raw}</span>;
      },
    },
  ];

  /* ─── Tab setup ─── */

  const tabCounts: Record<string, number> = {
    panel: panelLines.length,
    ssh: sshLines.length,
    website: websiteLines.length,
    audit: auditData.length,
  };

  const tabs = [
    { key: 'panel', label: 'Panel Log' },
    { key: 'ssh', label: 'SSH Log' },
    { key: 'website', label: 'Website Logs', icon: <GlobalOutlined /> },
    { key: 'audit', label: 'Audit Log' },
  ];

  /* ─── Toggle helpers ─── */

  const toggleStatusFilter = (group: string) => {
    setWsStatusFilters(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      if (next.size === 0) return new Set(['2xx', '3xx', '4xx', '5xx']);
      return next;
    });
  };

  const toggleMethodFilter = (method: string) => {
    setWsMethodFilters(prev => {
      const next = new Set(prev);
      if (next.has(method)) next.delete(method); else next.add(method);
      return next;
    });
  };

  const methodColor = (m: string) => {
    if (m === 'GET') return p.green;
    if (m === 'POST') return p.accent;
    if (m === 'PUT') return p.amber;
    if (m === 'DELETE') return p.red;
    if (m === 'PATCH') return p.purple;
    return p.textMuted;
  };

  const statusGroupColor = (g: string) => {
    if (g === '2xx') return p.green;
    if (g === '3xx') return p.accent;
    if (g === '4xx') return p.amber;
    if (g === '5xx') return p.red;
    return p.textMuted;
  };

  const auditActionColor = (action: string) => {
    const lower = action.toLowerCase();
    if (lower.includes('create') || lower.includes('add') || lower.includes('install')) return p.green;
    if (lower.includes('delete') || lower.includes('remove') || lower.includes('uninstall')) return p.red;
    if (lower.includes('update') || lower.includes('edit') || lower.includes('change') || lower.includes('reset')) return p.amber;
    if (lower.includes('login') || lower.includes('logout') || lower.includes('auth')) return p.purple;
    if (lower.includes('start') || lower.includes('stop') || lower.includes('restart')) return p.cyan;
    return p.accent;
  };

  /* ─── Render ─── */

  const sectionGap = 12;

  const renderPanelTab = () => {
    const { total, errors, warns, avgDuration, durationCount, infos, debugs } = panelStats;
    const levelTotal = errors + warns + infos + debugs || 1;
    const segments = [
      { color: p.red, pct: (errors / levelTotal) * 100, label: `Error (${errors})` },
      { color: p.amber, pct: (warns / levelTotal) * 100, label: `Warn (${warns})` },
      { color: '#58a6ff', pct: (infos / levelTotal) * 100, label: `Info (${infos})` },
      { color: '#8b949e', pct: (debugs / levelTotal) * 100, label: `Debug (${debugs})` },
    ];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: sectionGap }}>
        {/* Stats */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <MetricCard value={total} label="Total Entries" p={p} isDark={isDark} />
          <MetricCard value={errors} label="Errors" color={errors > 0 ? p.red : undefined} p={p} isDark={isDark} />
          <MetricCard value={warns} label="Warnings" color={warns > 0 ? p.amber : undefined} p={p} isDark={isDark} />
          {durationCount > 0 && (
            <MetricCard value={`${avgDuration.toFixed(0)}ms`} label="Avg Duration" p={p} isDark={isDark} />
          )}
        </div>

        {/* Level distribution */}
        {total > 0 && (
          <div style={{ padding: '0 4px' }}>
            <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Level Distribution</div>
            <DistributionBar segments={segments} p={p} />
          </div>
        )}

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: p.textDim, marginRight: 4 }}>Level:</span>
          {['all', 'error', 'warn', 'info', 'debug'].map(lvl => {
            const c = lvl === 'error' ? p.red : lvl === 'warn' ? p.amber : lvl === 'info' ? '#58a6ff' : lvl === 'debug' ? '#8b949e' : p.accent;
            return (
              <ToggleBtn key={lvl} active={levelFilter === lvl} color={c}
                label={lvl === 'all' ? 'ALL' : lvl.toUpperCase()} onClick={() => setLevelFilter(lvl)} p={p} />
            );
          })}
          <span style={{ fontSize: 11, color: p.textDim, marginLeft: 12, marginRight: 4 }}>Duration &gt;</span>
          {[0, 100, 500, 1000].map(ms => (
            <ToggleBtn key={ms} active={durationFilter === ms} color={p.accent}
              label={ms === 0 ? 'ALL' : `${ms}ms`} onClick={() => setDurationFilter(ms)} p={p} />
          ))}
        </div>

        {/* Table */}
        <Table
          columns={logColumns}
          dataSource={filtered}
          rowKey="key"
          loading={loading}
          size="small"
          pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [20, 50, 100, 200], showTotal: (t) => `${t} entries` }}
          scroll={{ x: 600, y: 'calc(100vh - 480px)' }}
          rowClassName={(r) => r.level === 'error' || r.level === 'fatal' ? 'log-row-error' : ''}
        />
      </div>
    );
  };

  const renderSshTab = () => {
    const { total, failed, accepted, uniqueIps, topAttackers } = sshStats;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: sectionGap }}>
        {/* Stats */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <MetricCard value={total} label="Total Events" p={p} isDark={isDark} />
          <MetricCard value={failed} label="Failed Attempts" color={failed > 0 ? p.red : undefined} p={p} isDark={isDark} />
          <MetricCard value={accepted} label="Accepted" color={accepted > 0 ? p.green : undefined} p={p} isDark={isDark} />
          <MetricCard value={uniqueIps} label="Unique IPs" p={p} isDark={isDark} />
        </div>

        {/* Top Attackers mini-list */}
        {topAttackers.length > 0 && (
          <div style={{
            padding: '10px 14px', borderRadius: 8,
            background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
            border: `1px solid ${p.cardBorder}`,
          }}>
            <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 6, fontWeight: 600 }}>
              Top Attackers (Failed Attempts)
            </div>
            <RankList items={topAttackers} maxCount={topAttackers[0]?.count || 1} color={p.red} p={p}
              onClickItem={(ip) => setSshIpFilter(ip)}
              onBlockItem={(ip) => { setBlockIPValue(ip); setBlockIPModalOpen(true); }} />
          </div>
        )}

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: p.textDim, marginRight: 4 }}>Level:</span>
          {['all', 'error', 'warn', 'info', 'debug'].map(lvl => {
            const c = lvl === 'error' ? p.red : lvl === 'warn' ? p.amber : lvl === 'info' ? '#58a6ff' : lvl === 'debug' ? '#8b949e' : p.accent;
            return (
              <ToggleBtn key={lvl} active={levelFilter === lvl} color={c}
                label={lvl === 'all' ? 'ALL' : lvl.toUpperCase()} onClick={() => setLevelFilter(lvl)} p={p} />
            );
          })}
          <span style={{ width: 1, height: 20, background: p.cardBorder, margin: '0 4px' }} />
          <Input
            placeholder="Filter by IP"
            value={sshIpFilter}
            onChange={(e) => setSshIpFilter(e.target.value)}
            allowClear
            size="small"
            style={{ width: 130 }}
            prefix={<SearchOutlined style={{ color: p.textDim, fontSize: 10 }} />}
          />
          {sshIpFilter && (
            <Tag color="blue" style={{ fontSize: 10, margin: 0, cursor: 'pointer' }}
              closable onClose={() => setSshIpFilter('')}
            >
              IP: {sshIpFilter}
            </Tag>
          )}
        </div>

        {/* Table */}
        {isJsonLog ? (
          <Table
            columns={logColumns}
            dataSource={filtered}
            rowKey="key"
            loading={loading}
            size="small"
            pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [20, 50, 100, 200], showTotal: (t) => `${t} entries` }}
            scroll={{ x: 600, y: 'calc(100vh - 480px)' }}
          />
        ) : (
          <Table
            columns={sshPlainColumns}
            dataSource={filtered}
            rowKey="key"
            loading={loading}
            size="small"
            pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [20, 50, 100, 200], showTotal: (t) => `${t} entries` }}
            scroll={{ x: 600, y: 'calc(100vh - 480px)' }}
            rowClassName={(r) => {
              const raw = r.raw.toLowerCase();
              if (raw.includes('failed') || raw.includes('invalid') || raw.includes('error')) return 'log-row-error';
              return '';
            }}
          />
        )}
      </div>
    );
  };

  const renderWebsiteTab = () => {
    if (!selectedSiteId) {
      return (
        <div style={{ textAlign: 'center', padding: 60, color: p.textMuted }}>
          <GlobalOutlined style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }} />
          <div style={{ fontSize: 14 }}>Select a website to view logs</div>
        </div>
      );
    }

    // Use backend stats when available (computed from ALL lines), fallback to local parsed stats
    const bs = wsBackendStats;
    const totalReqs = bs?.total_requests ?? wsStats.total;
    const uniqueIps = bs?.unique_ips ?? wsStats.uniqueIps;
    const totalBytes = bs?.total_bytes ?? wsStats.totalSize;
    const s2xx = bs?.status_2xx ?? wsStats.s2xx;
    const s3xx = bs?.status_3xx ?? wsStats.s3xx;
    const s4xx = bs?.status_4xx ?? wsStats.s4xx;
    const s5xx = bs?.status_5xx ?? wsStats.s5xx;
    const bsTopStatus = bs?.top_status ?? wsStats.topStatus;
    const errorRate = totalReqs > 0 ? ((s4xx + s5xx) / totalReqs) * 100 : 0;
    const statusTotal = s2xx + s3xx + s4xx + s5xx || 1;
    const statusSegments = [
      { color: p.green, pct: (s2xx / statusTotal) * 100, label: `2xx (${s2xx})` },
      { color: p.accent, pct: (s3xx / statusTotal) * 100, label: `3xx (${s3xx})` },
      { color: p.amber, pct: (s4xx / statusTotal) * 100, label: `4xx (${s4xx})` },
      { color: p.red, pct: (s5xx / statusTotal) * 100, label: `5xx (${s5xx})` },
    ];
    const showingSubset = totalReqs > wsStats.total;

    const showSidePanel = wsSidePanelOpen && !isMobile && websiteLogType === 'access';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: sectionGap }}>
        {/* Stats Dashboard */}
        {websiteLogType === 'access' && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <MetricCard value={totalReqs.toLocaleString()} label={showingSubset ? `Total Requests (showing ${wsStats.total})` : "Total Requests"} p={p} isDark={isDark} />
              <MetricCard value={`${errorRate.toFixed(1)}%`} label="Error Rate" color={errorRate > 5 ? p.red : errorRate > 0 ? p.amber : undefined} p={p} isDark={isDark} />
              <MetricCard value={uniqueIps} label="Unique IPs" p={p} isDark={isDark} />
              <MetricCard value={formatBytes(totalBytes)} label="Bandwidth" p={p} isDark={isDark} />
              {bsTopStatus > 0 && (
                <MetricCard value={<StatusBadge status={bsTopStatus} p={p} />} label="Top Status Code" p={p} isDark={isDark} />
              )}
            </div>

            {/* Status distribution bar */}
            {totalReqs > 0 && (
              <div style={{ padding: '0 4px' }}>
                <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Status Distribution</div>
                <DistributionBar segments={statusSegments} p={p} />
              </div>
            )}
          </>
        )}

        {/* Filter bar */}
        {websiteLogType === 'access' && (
          <div style={{
            display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
            padding: '8px 12px', borderRadius: 8,
            background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
            border: `1px solid ${p.cardBorder}`,
          }}>
            {/* Status + Method on same row */}
            <span style={{ fontSize: 11, color: p.textDim, fontWeight: 600 }}>Status:</span>
            <ToggleBtn active={wsStatusFilters.size === 4} color={p.accent} label="ALL"
              onClick={() => setWsStatusFilters(new Set(['2xx', '3xx', '4xx', '5xx']))} p={p} />
            {(['2xx', '3xx', '4xx', '5xx'] as const).map(g => (
              <ToggleBtn key={g} active={wsStatusFilters.has(g)} color={statusGroupColor(g)}
                label={g} onClick={() => toggleStatusFilter(g)} p={p} />
            ))}

            <span style={{ width: 1, height: 20, background: p.cardBorder, margin: '0 2px' }} />

            <span style={{ fontSize: 11, color: p.textDim, fontWeight: 600 }}>Method:</span>
            <ToggleBtn active={wsMethodFilters.size === 0} color={p.accent} label="ALL"
              onClick={() => setWsMethodFilters(new Set())} p={p} />
            {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(m => (
              <ToggleBtn key={m} active={wsMethodFilters.has(m)} color={methodColor(m)}
                label={m} onClick={() => toggleMethodFilter(m)} p={p} />
            ))}

            <span style={{ width: 1, height: 20, background: p.cardBorder, margin: '0 4px' }} />

            {/* IP / Path filters */}
            <Input
              placeholder="Filter by IP"
              value={wsIpFilter}
              onChange={(e) => setWsIpFilter(e.target.value)}
              allowClear
              size="small"
              style={{ width: 130 }}
              prefix={<SearchOutlined style={{ color: p.textDim, fontSize: 10 }} />}
            />
            <Input
              placeholder="Filter by path"
              value={wsPathFilter}
              onChange={(e) => setWsPathFilter(e.target.value)}
              allowClear
              size="small"
              style={{ width: 150 }}
              prefix={<SearchOutlined style={{ color: p.textDim, fontSize: 10 }} />}
            />

            {/* Side panel toggle */}
            {!isMobile && (
              <Tooltip title={wsSidePanelOpen ? 'Hide analytics' : 'Show analytics'}>
                <button onClick={() => setWsSidePanelOpen(!wsSidePanelOpen)} style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                  border: `1px solid ${wsSidePanelOpen ? p.accent : p.cardBorder}`,
                  background: wsSidePanelOpen ? `${p.accent}12` : 'transparent',
                  color: wsSidePanelOpen ? p.accent : p.textMuted,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <BarChartOutlined /> {wsSidePanelOpen ? <LeftOutlined style={{ fontSize: 9 }} /> : <RightOutlined style={{ fontSize: 9 }} />}
                </button>
              </Tooltip>
            )}

            {/* Active filter count */}
            {(wsStatusFilters.size < 4 || wsMethodFilters.size > 0 || wsIpFilter || wsPathFilter) && (
              <Tag color="blue" style={{ fontSize: 10, margin: 0, cursor: 'pointer' }}
                closable onClose={() => {
                  setWsStatusFilters(new Set(['2xx', '3xx', '4xx', '5xx']));
                  setWsMethodFilters(new Set());
                  setWsIpFilter('');
                  setWsPathFilter('');
                }}
              >
                {filteredWebsite.length} / {parsedWebsite.length} shown
              </Tag>
            )}
          </div>
        )}

        {/* Table + Side Panel layout */}
        <div style={{ display: 'flex', gap: 12 }}>
          {/* Table */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Table
              columns={websiteLogType === 'access' ? websiteAccessColumns : websiteErrorColumns}
              dataSource={filteredWebsite}
              rowKey="key"
              loading={loading}
              size="small"
              pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [20, 50, 100, 200], showTotal: (t) => `${t} entries` }}
              scroll={{ x: 600, y: 'calc(100vh - 560px)' }}
              rowClassName={(r) => {
                if (websiteLogType === 'access' && r.status >= 400) return 'log-row-error';
                if (websiteLogType === 'error') return 'log-row-error';
                return '';
              }}
              expandable={websiteLogType === 'access' ? {
                expandedRowKeys: [...wsExpandedRows],
                onExpand: (expanded, record) => {
                  setWsExpandedRows(prev => {
                    const next = new Set(prev);
                    if (expanded) next.add(record.key); else next.delete(record.key);
                    return next;
                  });
                },
                expandedRowRender: (record: ParsedAccessLog) => (
                  <div style={{
                    padding: '8px 12px', background: p.expandBg, borderRadius: 6,
                    fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4,
                  }}>
                    {record.referer && record.referer !== '-' && (
                      <div><span style={{ color: p.textDim, marginRight: 8 }}>Referer:</span><span style={{ color: p.text }}>{record.referer}</span></div>
                    )}
                    <div><span style={{ color: p.textDim, marginRight: 8 }}>User-Agent:</span><span style={{ color: p.text }}>{record.userAgent}</span></div>
                    <div style={{ marginTop: 4 }}>
                      <span style={{ color: p.textDim, marginRight: 8 }}>Raw:</span>
                      <code style={{
                        fontSize: 11, color: p.textMuted, background: p.codeBg,
                        padding: '2px 6px', borderRadius: 4, wordBreak: 'break-all',
                      }}>{record.raw}</code>
                    </div>
                  </div>
                ),
              } : undefined}
            />
          </div>

          {/* Side Panel */}
          {showSidePanel && (
            <div style={{
              width: 280, flexShrink: 0,
              padding: 14, borderRadius: 8,
              background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
              border: `1px solid ${p.cardBorder}`,
              display: 'flex', flexDirection: 'column', gap: 16,
              maxHeight: 'calc(100vh - 560px)', overflowY: 'auto',
            }}>
              {/* Top IPs */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: p.text }}>Top 10 IPs</div>
                </div>
                {wsTopIps.length > 0 ? (
                  <RankList items={wsTopIps} maxCount={wsTopIps[0].count} color={p.accent} p={p}
                    onClickItem={(ip) => setWsIpFilter(ip)}
                    onBlockItem={(ip) => { setBlockIPValue(ip); setBlockIPModalOpen(true); }} />
                ) : (
                  <div style={{ fontSize: 11, color: p.textDim }}>No data</div>
                )}
              </div>

              {/* Top Paths */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: p.text, marginBottom: 8 }}>Top 10 Paths</div>
                {wsTopPaths.length > 0 ? (
                  <RankList items={wsTopPaths} maxCount={wsTopPaths[0].count} color={p.green} p={p}
                    onClickItem={(path) => setWsPathFilter(path)} />
                ) : (
                  <div style={{ fontSize: 11, color: p.textDim }}>No data</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Audit filtered data (must be at top level, not inside render function)
  const filteredAudit = useMemo(() =>
    auditData.filter((row) =>
      !search.trim() || Object.values(row).some((v) => String(v).toLowerCase().includes(search.toLowerCase()))
    ), [auditData, search]);

  const renderAuditTab = () => {
    const { total, actions } = auditStats;
    const actionTotal = actions.reduce((s, a) => s + a.count, 0) || 1;
    const segments = actions.slice(0, 6).map((a) => ({
      color: auditActionColor(a.action),
      pct: (a.count / actionTotal) * 100,
      label: `${a.action} (${a.count})`,
    }));
    const remaining = actions.slice(6).reduce((s, a) => s + a.count, 0);
    if (remaining > 0) {
      segments.push({ color: p.textDim, pct: (remaining / actionTotal) * 100, label: `Other (${remaining})` });
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: sectionGap }}>
        {/* Stats */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <MetricCard value={total} label="Total Actions" p={p} isDark={isDark} />
          {actions.slice(0, 3).map(a => (
            <MetricCard key={a.action} value={a.count} label={a.action} color={auditActionColor(a.action)} p={p} isDark={isDark} />
          ))}
        </div>

        {/* Action distribution */}
        {total > 0 && (
          <div style={{ padding: '0 4px' }}>
            <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Action Distribution</div>
            <DistributionBar segments={segments} p={p} />
          </div>
        )}

        {/* Table */}
        <Table
          columns={auditColumns}
          dataSource={filteredAudit}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100, 200], showTotal: (t) => `${t} entries` }}
          scroll={{ x: 600, y: 'calc(100vh - 480px)' }}
        />
      </div>
    );
  };

  return (
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
        background: p.headerBg, flexWrap: 'wrap', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>{t('sidebar.logs')}</span>
          <Input
            prefix={<SearchOutlined style={{ color: p.textDim }} />}
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: isMobile ? 160 : 220 }}
          />
          {activeTab === 'website' && (
            <>
              <Select
                value={selectedSiteId}
                onChange={(val: number) => { setSelectedSiteId(val); setWebsiteLines([]); setLogDateRange(null); }}
                placeholder="Select website"
                style={{ width: isMobile ? 160 : 220 }}
                options={sites.map(s => ({ label: s.domain, value: s.id }))}
              />
              <Select
                value={websiteLogType}
                onChange={(val: 'access' | 'error') => { setWebsiteLogType(val); setWebsiteLines([]); }}
                style={{ width: isMobile ? 100 : 130 }}
                options={[
                  { label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><FileTextOutlined style={{ fontSize: 12 }} /> Access Log</span>, value: 'access' },
                  { label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ExclamationCircleOutlined style={{ fontSize: 12 }} /> Error Log</span>, value: 'error' },
                ]}
              />
              <DatePicker.RangePicker
                value={logDateRange}
                onChange={(dates) => { setLogDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null); setWebsiteLines([]); }}
                allowClear
                placeholder={['Start date', 'End date']}
                style={{ width: isMobile ? 220 : 260 }}
                size="middle"
                disabledDate={(current) => current && current.isAfter(dayjs(), 'day')}
                presets={[
                  { label: 'Today', value: [dayjs(), dayjs()] },
                  { label: 'Yesterday', value: [dayjs().subtract(1, 'day'), dayjs().subtract(1, 'day')] },
                  { label: 'Last 3 days', value: [dayjs().subtract(2, 'day'), dayjs()] },
                  { label: 'Last 7 days', value: [dayjs().subtract(6, 'day'), dayjs()] },
                  { label: 'Last 30 days', value: [dayjs().subtract(29, 'day'), dayjs()] },
                ]}
              />
            </>
          )}
          <Select
            value={lines}
            onChange={(val: number) => setLines(val)}
            options={[
              { label: '100 lines', value: 100 },
              { label: '200 lines', value: 200 },
              { label: '500 lines', value: 500 },
              { label: '1000 lines', value: 1000 },
            ]}
            style={{ width: isMobile ? 90 : 130 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={refresh}
            style={{
              padding: '5px 14px', borderRadius: 6,
              border: `1px solid ${p.cardBorder}`, background: 'transparent',
              color: p.textMuted, fontSize: 12, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              transition: 'all 0.15s',
            }}
          >
            <ReloadOutlined /> {t('common.refresh')}
          </button>
          {activeTab !== 'audit' && (
            <Popconfirm title={clearLogLabel} onConfirm={handleClearLog}>
              <button style={{
                padding: '5px 12px', borderRadius: 6,
                border: `1px solid ${p.red}`, background: 'transparent',
                color: p.red, fontSize: 12, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
                <ClearOutlined /> Clear
              </button>
            </Popconfirm>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        padding: '8px 20px',
        borderBottom: `1px solid ${p.cardBorder}`,
        display: 'flex', gap: 4, flexWrap: 'wrap',
      }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              setSearch('');
              setLevelFilter('all');
              setDurationFilter(0);
              setSshIpFilter('');
              setWsIpFilter('');
              setWsPathFilter('');
            }}
            style={{
              padding: '6px 16px', borderRadius: 6,
              border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 500,
              background: activeTab === tab.key ? `${p.accent}15` : 'transparent',
              color: activeTab === tab.key ? p.accent : p.textMuted,
              transition: 'all 0.15s',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            {tab.label}
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 3,
              background: activeTab === tab.key ? `${p.accent}20` : p.codeBg,
              color: activeTab === tab.key ? p.accent : p.textDim,
            }}>{tabCounts[tab.key]}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 16 }}>
        {activeTab === 'panel' && renderPanelTab()}
        {activeTab === 'ssh' && renderSshTab()}
        {activeTab === 'website' && renderWebsiteTab()}
        {activeTab === 'audit' && renderAuditTab()}
      </div>

      <style>{`
        .log-row-error td { background: ${isDark ? 'rgba(248,81,73,0.06)' : '#fff1f0'} !important; }
        .ant-table-row:hover .log-row-error td { background: ${isDark ? 'rgba(248,81,73,0.1)' : '#ffccc7'} !important; }
      `}</style>

      {/* Block IP Modal */}
      <Modal
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StopOutlined style={{ color: p.red }} />
            Block IP Address
          </span>
        }
        open={blockIPModalOpen}
        onCancel={() => { setBlockIPModalOpen(false); setBlockIPValue(''); blockIPForm.resetFields(); }}
        footer={null}
        destroyOnHidden
        width={440}
      >
        <div style={{
          marginBottom: 12, padding: '10px 12px', borderRadius: 8,
          background: `${p.red}10`, border: `1px solid ${p.red}20`,
          fontSize: 12, color: p.text,
        }}>
          This will immediately block all incoming traffic from <b>{blockIPValue}</b> at the firewall level.
        </div>
        <Form form={blockIPForm} layout="vertical" onFinish={handleBlockIPFromLog} preserve={false}>
          <Form.Item
            name="ip"
            label="IP Address"
            rules={[{ required: true, message: 'Enter an IP address' }]}
            initialValue={blockIPValue}
            extra="Single IP (192.168.1.100) or CIDR (10.0.0.0/24)"
          >
            <Input placeholder="192.168.1.100" style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="button"
              onClick={() => { setBlockIPModalOpen(false); setBlockIPValue(''); blockIPForm.resetFields(); }}
              style={{
                padding: '5px 14px', borderRadius: 6,
                border: `1px solid ${p.cardBorder}`, background: 'transparent',
                color: p.textMuted, fontSize: 12, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={blockIPLoading}
              style={{
                padding: '5px 14px', borderRadius: 6, border: 'none', cursor: blockIPLoading ? 'wait' : 'pointer',
                background: p.red, color: '#fff', fontSize: 12, fontWeight: 500,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                opacity: blockIPLoading ? 0.6 : 1,
              }}
            >
              {blockIPLoading ? 'Blocking...' : 'Block IP'}
            </button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
