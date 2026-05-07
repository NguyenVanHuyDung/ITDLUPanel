import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Card, Table, Button, Space, Input, InputNumber, Select, Switch, Modal, Form,
  Tag, Popconfirm, message, Spin, Row, Col,
  Tooltip, Progress, Divider, Alert, Empty, Drawer, Badge, Statistic
} from 'antd';
import {
  SafetyOutlined, PlusOutlined, ReloadOutlined, DeleteOutlined,
  EditOutlined, EyeOutlined, SearchOutlined, SettingOutlined,
  PlayCircleOutlined, StopOutlined, ThunderboltOutlined,
  GlobalOutlined, LockOutlined, AlertOutlined, FileTextOutlined,
  NodeIndexOutlined, BlockOutlined, CheckCircleOutlined, CloseCircleOutlined,
  CloudServerOutlined, ImportOutlined, ExportOutlined, CopyOutlined,
  LineChartOutlined, PieChartOutlined, BarChartOutlined,
  ClockCircleOutlined, GlobalOutlined as GeoIcon,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePalette } from '@/hooks/usePalette';
import type { ApiResponse, PaginatedResponse } from '@/types';
import api from '@/services/api';

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

const WafIcons = {
  Shield: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Server: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  ),
  Rule: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  Log: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  Gear: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  Globe: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  Block: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  ),
  Check: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Alert: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  Ip: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  ),
  Chart: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  Traffic: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  Map: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  ),
  List: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  Code: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  Clock: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Activity: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WAFStatus {
  installed: boolean; running: boolean; haproxy_installed: boolean; coraza_installed: boolean;
  version: string; mode: string; uptime: number; total_sites: number; active_sites: number;
  total_rules: number; active_rules: number; blocked_today: number; total_requests_today: number;
}

interface WAFSite {
  id: number; name: string; domain: string; backend_url: string; listen_port: number;
  ssl_port: number; enabled: boolean; mode: string; ssl_enabled: boolean;
  ssl_cert_path?: string; ssl_key_path?: string; health_check_path?: string;
  max_connections: number; timeout_client: number; timeout_server: number;
  description?: string; rules_count: number; created_at: string; updated_at: string;
}

interface WAFRule {
  id: number; name: string; rule_type: string; category: string; phase: number;
  action: string; rule_content: string; enabled: boolean; priority: number;
  log_level: string; description?: string; rule_group?: string; owasp_rule_id?: string;
  created_at: string; updated_at: string;
}

interface WAFOWASPCategory {
  id: number; category_id: string; name: string; description?: string;
  enabled: boolean; severity: string; mitre_technique: string;
}

interface WAFSettings {
  global_mode: string; owasp_rules_enabled: boolean; owasp_ruleset_version: string;
  paranoia_level: number; anomaly_threshold: number; log_requests: string;
  log_retention_days: number; log_request_body: boolean; geo_blocking_enabled: boolean;
  geo_blocked_countries: string[]; whitelisted_ips: string[]; blacklisted_ips: string[];
  service_status: string;
}

interface WAFLogEntry {
  id: number; timestamp: string; site_id?: number; site_name?: string; client_ip: string;
  method: string; uri: string; host: string; rule_id?: string; rule_message?: string;
  rule_severity?: string; rule_category?: string; action_taken: string;
  anomaly_score?: number; geo_country?: string; user_agent?: string; referer?: string;
  response_code?: number; request_body?: string; request_headers?: string; matched_data?: string;
}

interface WAFStats {
  total_requests: number; blocked_requests: number; allowed_requests: number;
  sqli_count: number; xss_count: number; lfi_count: number; rce_count: number;
  other_count: number; block_rate: number;
  top_blocked_ips: { ip: string; count: number }[];
  top_triggered_rules: { rule_id: string; name: string; category: string; count: number }[];
  avg_anomaly_score: number; requests_by_hour: { hour: string; allowed: number; blocked: number }[];
}

interface WAFTrafficStats {
  period: string; period_key: string; total_bytes_in: number; total_bytes_out: number;
  total_requests: number; blocked_requests: number; avg_response_ms: number;
  max_response_ms: number; p95_response_ms: number;
  top_countries: WAFGeoEntry[]; top_clients: { ip: string; count: number }[];
  traffic_by_hour: { hour: string; total_requests: number; blocked_requests: number; avg_response_ms: number }[];
  bandwidth_by_hour: { hour: string; bytes_in: number; bytes_out: number }[];
}

interface WAFSlowRequest {
  id: number; site_id?: number; site_name?: string; client_ip: string; geo_country?: string;
  method: string; uri: string; host: string; response_ms: number; threshold_ms: number; timestamp: string;
}

interface WAFIPEntry {
  id: number; ip_address: string; list_type: string; description?: string;
  expires_at?: string; created_at: string; hit_count: number; last_hit?: string;
  is_cidr: boolean; source: string;
}

interface WAFURIEntry {
  id: number; uri_pattern: string; list_type: string; action: string;
  description?: string; enabled: boolean; priority: number; created_at: string;
}

interface WAFLuaScript {
  id: number; name: string; description?: string; script_content: string;
  enabled: boolean; priority: number; created_at: string;
}

interface WAFUAEntry {
  id: number; ua_pattern: string; list_type: string; description?: string;
  enabled: boolean; created_at: string;
}

interface WAFGeoEntry {
  country_code: string; country_name: string; total_requests: number;
  blocked_requests: number; unique_ips: number;
}

interface WAFGeoStats {
  top_countries: WAFGeoEntry[]; total_countries: number; blocked_by_country: WAFGeoEntry[];
}

interface WAFAttackFeedEntry {
  id: number; timestamp: string; client_ip: string; geo_country?: string; geo_city?: string;
  method: string; uri: string; host: string; rule_id?: string; rule_message?: string;
  rule_category?: string; rule_severity?: string; action_taken: string;
  anomaly_score?: number; user_agent?: string; response_code?: number;
  site_id?: number; site_name?: string; latency_ms?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useStyles() {
  const { p, isDark } = usePalette();
  const isMobile = useIsMobile();
  const sectionBox: React.CSSProperties = {
    maxWidth: 'none', borderRadius: 12,
    background: isDark ? p.rowAlt : p.card,
    border: `1px solid ${p.cardBorder}`,
    padding: isMobile ? 16 : 24,
  };
  return { sectionBox, p, isDark, isMobile };
}

function SectionTitle({ icon, title, extra }: { icon: React.ReactNode; title: string; extra?: React.ReactNode }) {
  const { p } = usePalette();
  return (
    <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: p.accent }}>{icon}</div>
        <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>{title}</span>
      </div>
      {extra}
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function severityColor(sev: string, p: any): string {
  switch (sev?.toLowerCase()) {
    case 'critical': return p.red;
    case 'error': return '#FF6B6B';
    case 'warning': return p.amber;
    case 'notice': return p.accent;
    default: return p.textMuted;
  }
}

function categoryColor(cat: string, p: any): string {
  switch (cat?.toUpperCase()) {
    case 'SQLI': return '#FF6B6B'; case 'XSS': return p.amber;
    case 'LFI': return '#9B59B6'; case 'RCE': return p.red;
    case 'CRLF': return p.accent; case 'TRAVERSAL': return '#E67E22';
    case 'RFI': return '#E74C3C'; case 'PHP': return '#8E44AD';
    case 'JAVA': return '#D35400'; case 'NODE': return '#27AE60';
    default: return p.textMuted;
  }
}

function attackLabel(cat: string): string {
  switch (cat?.toUpperCase()) {
    case 'SQLI': return 'SQL Injection'; case 'XSS': return 'Cross-Site Scripting';
    case 'LFI': return 'Local File Inclusion'; case 'RCE': return 'Remote Code Execution';
    case 'CRLF': return 'CRLF Injection'; case 'TRAVERSAL': return 'Path Traversal';
    case 'RFI': return 'Remote File Inclusion'; case 'PHP': return 'PHP Injection';
    case 'JAVA': return 'Java Injection'; case 'NODE': return 'Node.js Injection';
    case 'EVASION': return 'WAF Evasion'; case 'GENERIC': return 'Generic Attack';
    default: return cat || 'Unknown';
  }
}

const countryFlags: Record<string, string> = {
  CN: '🇨🇳', RU: '🇷🇺', KR: '🇰🇷', IR: '🇮🇷', BY: '🇧🇾', NG: '🇳🇬', IN: '🇮🇳', PK: '🇵🇰',
  VN: '🇻🇳', US: '🇺🇸', DE: '🇩🇪', GB: '🇬🇧', JP: '🇯🇵', SG: '🇸🇬', BR: '🇧🇷', ID: '🇮🇩',
  TH: '🇹🇭', MY: '🇲🇾', PH: '🇵🇭', AU: '🇦🇺', CA: '🇨🇦', FR: '🇫🇷', ES: '🇪🇸', IT: '🇮🇹',
  NL: '🇳🇱', TR: '🇹🇷', MX: '🇲🇽', AR: '🇦🇷', PL: '🇵🇱', UA: '🇺🇦', RO: '🇷🇴', CZ: '🇨🇿',
  HU: '🇭🇺', SE: '🇸🇪', NO: '🇳🇴', DK: '🇩🇰', FI: '🇫🇮', AT: '🇦🇹', BE: '🇧🇪', CH: '🇨🇭',
  PT: '🇵🇹', GR: '🇬🇷', IL: '🇮🇱', AE: '🇦🇪', SA: '🇸🇦', EG: '🇪🇬', ZA: '🇿🇦',
  CO: '🇨🇴', CL: '🇨🇱', PE: '🇵🇪', TW: '🇹🇼', HK: '🇭🇰', BD: '🇧🇩', LK: '🇱🇰', NZ: '🇳🇿',
};

function flag(code: string): string {
  return countryFlags[code?.toUpperCase()] || '🌐';
}

// ---------------------------------------------------------------------------
// Mini Chart Component (pure SVG)
// ---------------------------------------------------------------------------

function MiniLineChart({ data, color, height = 60 }: { data: number[]; color: string; height?: number }) {
  if (!data || data.length < 2) return <div style={{ height }} />;
  const max = Math.max(...data, 1);
  const w = 200;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - (v / max) * (height - 4);
    return `${x},${y}`;
  }).join(' ');
  const area = [
    `0,${height}`,
    ...data.map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = height - (v / max) * (height - 4);
      return `${x},${y}`;
    }),
    `${w},${height}`,
  ].join(' ');
  return (
    <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#grad-${color.replace('#', '')})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// World Map (SVG based - simplified projection)
// ---------------------------------------------------------------------------

function WorldMap({ attackData }: { attackData: WAFGeoEntry[] }) {
  const { p, isDark } = usePalette();
  const [hovered, setHovered] = useState<string | null>(null);

  const totalBlocked = attackData.reduce((sum, d) => sum + d.blocked_requests, 0);
  const maxBlocked = Math.max(...attackData.map(d => d.blocked_requests), 1);

  // Simplified attack coordinates (approximate lat/lon to SVG)
  const countryCoords: Record<string, { x: number; y: number }> = {
    CN: { x: 115, y: 35 }, RU: { x: 100, y: 60 }, KR: { x: 128, y: 36 }, IR: { x: 53, y: 32 },
    VN: { x: 108, y: 16 }, US: { x: 40, y: 38 }, DE: { x: 10, y: 51 }, JP: { x: 138, y: 36 },
    GB: { x: 0, y: 51 }, FR: { x: 5, y: 46 }, BR: { x: 50, y: -15 }, IN: { x: 77, y: 20 },
    AU: { x: 133, y: -25 }, CA: { x: 30, y: 55 }, SG: { x: 104, y: 1 }, NL: { x: 5, y: 52 },
    IT: { x: 12, y: 42 }, ES: { x: -4, y: 40 }, TR: { x: 35, y: 39 }, MX: { x: 15, y: 23 },
    PL: { x: 20, y: 52 }, UA: { x: 32, y: 49 }, SE: { x: 18, y: 62 }, NO: { x: 15, y: 64 },
    ZA: { x: 25, y: -29 }, NG: { x: 8, y: 9 }, AR: { x: 45, y: -35 }, TH: { x: 100, y: 15 },
    ID: { x: 118, y: -5 }, MY: { x: 102, y: 4 }, PH: { x: 121, y: 12 }, NZ: { x: 174, y: -41 },
    PK: { x: 70, y: 30 }, EG: { x: 30, y: 27 }, SA: { x: 45, y: 24 }, AE: { x: 55, y: 24 },
    BD: { x: 90, y: 24 }, LK: { x: 81, y: 7 }, CO: { x: 48, y: 4 }, CL: { x: 45, y: -30 },
    BE: { x: 4, y: 50 }, CH: { x: 8, y: 47 }, AT: { x: 14, y: 47 }, PT: { x: -8, y: 39 },
    GR: { x: 22, y: 39 }, IL: { x: 35, y: 31 }, HK: { x: 114, y: 22 }, TW: { x: 121, y: 24 },
    CZ: { x: 15, y: 50 }, HU: { x: 19, y: 47 }, RO: { x: 25, y: 46 }, DK: { x: 10, y: 56 },
    FI: { x: 26, y: 64 },
  };

  return (
    <div style={{ position: 'relative', width: '100%', borderRadius: 8, overflow: 'hidden', background: isDark ? `${p.card}40` : '#f0f4f8' }}>
      <svg viewBox="0 0 240 120" style={{ width: '100%', display: 'block' }}>
        {/* Simplified world outline */}
        <rect x="0" y="0" width="240" height="120" fill={isDark ? `${p.accent}05` : '#e8eef5'} rx="8" />
        <text x="120" y="10" textAnchor="middle" fontSize="6" fill={p.textMuted} fontFamily="sans-serif">Attack Origins (24h)</text>

        {/* Attack dots */}
        {attackData.map(entry => {
          const coords = countryCoords[entry.country_code];
          if (!coords) return null;
          const intensity = Math.max(0.3, entry.blocked_requests / maxBlocked);
          const radius = 2 + intensity * 6;
          const isHov = hovered === entry.country_code;
          return (
            <g key={entry.country_code}
              onMouseEnter={() => setHovered(entry.country_code)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'pointer' }}
            >
              <circle cx={coords.x} cy={coords.y} r={isHov ? radius + 3 : radius + 1}
                fill={`${p.red}20`} />
              <circle cx={coords.x} cy={coords.y} r={radius}
                fill={p.red} fillOpacity={0.4 + intensity * 0.6}
                stroke={isHov ? p.amber : 'none'} strokeWidth="1.5" />
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hovered && (() => {
        const entry = attackData.find(d => d.country_code === hovered);
        if (!entry) return null;
        return (
          <div style={{
            position: 'absolute', top: 10, right: 10, padding: '8px 12px',
            background: isDark ? p.card : '#fff', border: `1px solid ${p.cardBorder}`,
            borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            fontSize: 12, minWidth: 140,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {flag(entry.country_code)} {entry.country_name}
            </div>
            <div style={{ color: p.red, fontWeight: 600 }}>{entry.blocked_requests.toLocaleString()} blocked</div>
            <div style={{ color: p.textMuted, fontSize: 11 }}>{entry.total_requests.toLocaleString()} total requests</div>
          </div>
        );
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: Enhanced Overview Dashboard
// ---------------------------------------------------------------------------

function OverviewTab({ status, stats, trafficStats, geoStats, onRefresh, onInstall, onRestart, onToggle }: {
  status: WAFStatus | null; stats: WAFStats | null; trafficStats: WAFTrafficStats | null;
  geoStats: WAFGeoStats | null;
  onRefresh: () => void; onInstall: () => void; onRestart: () => void; onToggle: (enabled: boolean) => void;
  installing: boolean; toggling: boolean;
}) {
  const { t } = useTranslation();
  const { sectionBox, p, isDark } = useStyles();
  const [isDarkState] = [isDark];

  if (!status) {
    return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>;
  }

  if (!status.installed) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ width: 80, height: 80, borderRadius: 20, margin: '0 auto 24px', background: `${p.accent}10`, border: `2px solid ${p.accent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <WafIcons.Shield size={40} color={p.accent} />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: p.text, margin: '0 0 8px' }}>Web Application Firewall</h2>
        <p style={{ fontSize: 13, color: p.textMuted, marginBottom: 24, lineHeight: 1.7 }}>
          Protect your web applications with HAProxy + Coraza WAF. Uses OWASP Core Rule Set v4 to detect and block SQL injection, XSS, LFI, RCE, and other web attacks in real-time.
        </p>
        <Button type="primary" size="large" icon={<SafetyOutlined />} onClick={onInstall} style={{ height: 44, borderRadius: 8 }}>
          Enable WAF
        </Button>
      </div>
    );
  }

  const blockRate = stats?.block_rate ?? 0;
  const qps = stats?.total_requests ? Math.round(stats.total_requests / 86400 * 10) / 10 : 0;
  const reqChartData = (stats?.requests_by_hour ?? []).map(h => h.allowed + h.blocked);
  const blockChartData = (stats?.requests_by_hour ?? []).map(h => h.blocked);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Status Header */}
      <div style={sectionBox}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: status.running ? `${p.green}15` : `${p.red}15`, border: `2px solid ${status.running ? p.green : p.red}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <WafIcons.Shield size={28} color={status.running ? p.green : p.red} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: p.text }}>{status.running ? 'WAF Active' : 'WAF Stopped'}</div>
              <div style={{ fontSize: 12, color: p.textMuted }}>
                Coraza SPOA v{status.version || '0.6.1'} · HAProxy + Coraza WAF · Uptime: {formatUptime(status.uptime)}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button icon={<ReloadOutlined />} onClick={onRefresh}>Refresh</Button>
            <Button icon={<PlayCircleOutlined />} onClick={onRestart}>Restart</Button>
            <Popconfirm title={status.mode === 'blocking' ? 'Switch to Detection Mode?' : 'Switch to Blocking Mode?'} description={status.mode === 'blocking' ? 'WAF will log attacks but allow requests through.' : 'WAF will actively block malicious requests.'} onConfirm={() => onToggle(status.mode !== 'blocking')}>
              <Tag color={status.mode === 'blocking' ? 'green' : 'orange'} style={{ fontSize: 13, padding: '4px 12px', cursor: 'pointer' }}>
                {status.mode === 'blocking' ? '🛡 Blocking' : '🔍 Detection'}
              </Tag>
            </Popconfirm>
          </div>
        </div>
      </div>

      {/* Key Stats Grid */}
      <Row gutter={[12, 12]}>
        {[
          { label: 'Total Requests (24h)', value: (stats?.total_requests ?? 0).toLocaleString(), color: p.accent, icon: <WafIcons.Activity size={14} />, chart: reqChartData },
          { label: 'Blocked', value: (stats?.blocked_requests ?? 0).toLocaleString(), color: p.red, icon: <BlockOutlined />, chart: blockChartData },
          { label: 'Allowed', value: (stats?.allowed_requests ?? 0).toLocaleString(), color: p.green, icon: <CheckCircleOutlined /> },
          { label: 'Block Rate', value: `${blockRate.toFixed(1)}%`, color: blockRate > 10 ? p.red : p.green, icon: <ThunderboltOutlined /> },
          { label: 'Avg Score', value: (stats?.avg_anomaly_score ?? 0).toFixed(1), color: p.amber, icon: <AlertOutlined /> },
          { label: 'Sites / Rules', value: `${status.active_sites} / ${status.active_rules}`, color: p.purple, icon: <CloudServerOutlined /> },
        ].map((stat, i) => (
          <Col xs={12} sm={8} lg={4} key={i}>
            <div style={{ ...sectionBox, padding: 16, background: `${stat.color}08`, border: `1px solid ${stat.color}20` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: p.textMuted, fontWeight: 500 }}>{stat.label}</span>
                <span style={{ color: stat.color, opacity: 0.8 }}>{stat.icon}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.value}</div>
              {(stat as any).chart && (stat as any).chart.length > 1 && (
                <div style={{ marginTop: 8, opacity: 0.7 }}>
                  <MiniLineChart data={(stat as any).chart} color={stat.color} height={32} />
                </div>
              )}
            </div>
          </Col>
        ))}
      </Row>

      {/* Charts Row: Request Trends + Resource Time */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <div style={sectionBox}>
            <SectionTitle icon={<LineChartOutlined style={{ color: p.accent }} />} title="Request Trends (24h)" />
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 3, background: p.green, borderRadius: 2, display: 'inline-block' }} />
                  Allowed
                </div>
                <MiniLineChart data={reqChartData.map((v, i) => v - (blockChartData[i] || 0))} color={p.green} height={50} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 3, background: p.red, borderRadius: 2, display: 'inline-block' }} />
                  Blocked
                </div>
                <MiniLineChart data={blockChartData} color={p.red} height={50} />
              </div>
            </div>
          </div>
        </Col>
        <Col xs={24} lg={10}>
          <div style={sectionBox}>
            <SectionTitle icon={<ClockCircleOutlined style={{ color: p.accent }} />} title="Avg Response Time" />
            <div style={{ fontSize: 32, fontWeight: 700, color: p.accent }}>
              {(trafficStats?.avg_response_ms ?? 0).toFixed(0)}<span style={{ fontSize: 14, color: p.textMuted, fontWeight: 400 }}> ms</span>
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 12 }}>
              <div><span style={{ color: p.textMuted }}>Max: </span><span style={{ color: p.text, fontWeight: 600 }}>{trafficStats?.max_response_ms ?? 0}ms</span></div>
              <div><span style={{ color: p.textMuted }}>P95: </span><span style={{ color: p.text, fontWeight: 600 }}>{trafficStats?.p95_response_ms ?? 0}ms</span></div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 6 }}>Bandwidth</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                <div><span style={{ color: p.green }}>↓ {formatBytes(trafficStats?.total_bytes_in ?? 0)}</span></div>
                <div><span style={{ color: p.accent }}>↑ {formatBytes(trafficStats?.total_bytes_out ?? 0)}</span></div>
              </div>
            </div>
          </div>
        </Col>
      </Row>

      {/* Attack Categories + World Map */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <div style={sectionBox}>
            <SectionTitle icon={<AlertOutlined style={{ color: p.accent }} />} title="Attack Detection (24h)" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'SQL Injection', count: stats?.sqli_count ?? 0, color: '#FF6B6B' },
                { label: 'Cross-Site Scripting', count: stats?.xss_count ?? 0, color: p.amber },
                { label: 'Local File Inclusion', count: stats?.lfi_count ?? 0, color: '#9B59B6' },
                { label: 'Remote Code Execution', count: stats?.rce_count ?? 0, color: p.red },
                { label: 'Other Attacks', count: stats?.other_count ?? 0, color: p.textMuted },
              ].map((cat, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: `${cat.color}08` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: p.text }}>{cat.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: cat.color }}>{(cat.count as number).toLocaleString()}</span>
                    </div>
                    <div style={{ height: 4, background: `${cat.color}20`, borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${stats?.total_requests ? Math.min(100, (cat.count as number / stats.total_requests) * 500) : 0}%`, background: cat.color, borderRadius: 2, transition: 'width 0.3s' }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Col>
        <Col xs={24} lg={12}>
          <div style={sectionBox}>
            <SectionTitle icon={<GlobalOutlined style={{ color: p.accent }} />} title="Attack Origins (24h)" />
            <WorldMap attackData={geoStats?.top_countries ?? []} />
          </div>
        </Col>
      </Row>

      {/* Top Blocked IPs & Top Rules */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <div style={sectionBox}>
            <SectionTitle icon={<WafIcons.Ip size={16} color={p.accent} />} title="Top Blocked IPs (24h)" />
            {stats?.top_blocked_ips && stats.top_blocked_ips.length > 0 ? (
              <div>
                {stats.top_blocked_ips.slice(0, 6).map((ip, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${p.cardBorder}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: p.textMuted, width: 16, textAlign: 'right' }}>{i + 1}</span>
                      <code style={{ fontSize: 12, color: p.accent, fontWeight: 600 }}>{ip.ip}</code>
                    </div>
                    <Tag color="red" style={{ margin: 0, fontSize: 11 }}>{ip.count.toLocaleString()} blocked</Tag>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 20, color: p.textMuted, fontSize: 12 }}>No blocked IPs in the last 24 hours</div>
            )}
          </div>
        </Col>
        <Col xs={24} lg={12}>
          <div style={sectionBox}>
            <SectionTitle icon={<WafIcons.Rule size={16} color={p.accent} />} title="Top Triggered Rules (24h)" />
            {stats?.top_triggered_rules && stats.top_triggered_rules.length > 0 ? (
              <div>
                {stats.top_triggered_rules.slice(0, 6).map((rule, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${p.cardBorder}` }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: p.text }}>{rule.name}</div>
                      {rule.rule_id && <code style={{ fontSize: 10, color: p.textMuted }}>{rule.rule_id}</code>}
                    </div>
                    <Tag color="orange" style={{ margin: 0, fontSize: 11 }}>{rule.count.toLocaleString()}</Tag>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 20, color: p.textMuted, fontSize: 12 }}>No rules triggered in the last 24 hours</div>
            )}
          </div>
        </Col>
      </Row>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: Traffic Monitoring
// ---------------------------------------------------------------------------

function TrafficTab({ trafficStats, slowRequests, geoStats, loading, onRefresh }: {
  trafficStats: WAFTrafficStats | null; slowRequests: WAFSlowRequest[];
  geoStats: WAFGeoStats | null; loading: boolean; onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const { sectionBox, p, isDark } = useStyles();
  const [period, setPeriod] = useState('hourly');

  const reqData = (trafficStats?.traffic_by_hour ?? []).map(h => h.total_requests);
  const blockedData = (trafficStats?.traffic_by_hour ?? []).map(h => h.blocked_requests);
  const respData = (trafficStats?.traffic_by_hour ?? []).map(h => h.avg_response_ms);

  const slowColumns = [
    { title: 'Time', dataIndex: 'timestamp', key: 'timestamp', width: 150, render: (v: string) => <span style={{ fontSize: 11, color: p.textMuted }}>{new Date(v).toLocaleString()}</span> },
    { title: 'IP', dataIndex: 'client_ip', key: 'client_ip', width: 130, render: (v: string, r: WAFSlowRequest) => <div><code style={{ fontSize: 12, color: p.accent }}>{v}</code>{r.geo_country && <div style={{ fontSize: 10, color: p.textMuted }}>{flag(r.geo_country)} {r.geo_country}</div>}</div> },
    { title: 'Method', dataIndex: 'method', key: 'method', width: 70, render: (v: string) => <Tag style={{ margin: 0, fontSize: 10 }}>{v}</Tag> },
    { title: 'URI', dataIndex: 'uri', key: 'uri', ellipsis: true, render: (v: string) => <code style={{ fontSize: 11 }}>{v.length > 40 ? v.substring(0, 40) + '...' : v}</code> },
    { title: 'Response', dataIndex: 'response_ms', key: 'response_ms', width: 100, render: (v: number, r: WAFSlowRequest) => <span style={{ fontWeight: 700, color: v > 10000 ? p.red : v > 5000 ? p.amber : p.accent }}>{v}ms</span> },
    { title: 'Site', dataIndex: 'site_name', key: 'site_name', width: 120, render: (v: string) => v ? <Tag style={{ margin: 0, fontSize: 10 }}>{v}</Tag> : <span style={{ color: p.textMuted, fontSize: 11 }}>-</span> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Summary Cards */}
      <Row gutter={[12, 12]}>
        {[
          { label: 'Total Requests', value: (trafficStats?.total_requests ?? 0).toLocaleString(), color: p.accent, icon: <NodeIndexOutlined /> },
          { label: 'Blocked', value: (trafficStats?.blocked_requests ?? 0).toLocaleString(), color: p.red, icon: <BlockOutlined /> },
          { label: 'Data In', value: formatBytes(trafficStats?.total_bytes_in ?? 0), color: p.green, icon: <WafIcons.Activity size={14} /> },
          { label: 'Data Out', value: formatBytes(trafficStats?.total_bytes_out ?? 0), color: p.amber, icon: <WafIcons.Activity size={14} /> },
          { label: 'Avg Response', value: `${(trafficStats?.avg_response_ms ?? 0).toFixed(0)}ms`, color: p.purple, icon: <ClockCircleOutlined /> },
          { label: 'P95 Response', value: `${trafficStats?.p95_response_ms ?? 0}ms`, color: p.accent, icon: <ClockCircleOutlined /> },
        ].map((stat, i) => (
          <Col xs={12} sm={8} lg={4} key={i}>
            <div style={{ ...sectionBox, padding: 14, background: `${stat.color}08`, border: `1px solid ${stat.color}20` }}>
              <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 6 }}>{stat.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: stat.color }}>{stat.value}</div>
            </div>
          </Col>
        ))}
      </Row>

      {/* Charts */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <div style={sectionBox}>
            <SectionTitle icon={<LineChartOutlined style={{ color: p.accent }} />} title="Request Volume by Hour" />
            <MiniLineChart data={reqData} color={p.accent} height={70} />
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11 }}>
              <div><span style={{ width: 8, height: 3, background: p.accent, borderRadius: 2, display: 'inline-block' }} /> Total: {reqData.reduce((a, b) => a + b, 0).toLocaleString()}</div>
              <div><span style={{ width: 8, height: 3, background: p.red, borderRadius: 2, display: 'inline-block' }} /> Blocked: {blockedData.reduce((a, b) => a + b, 0).toLocaleString()}</div>
            </div>
          </div>
        </Col>
        <Col xs={24} lg={12}>
          <div style={sectionBox}>
            <SectionTitle icon={<BarChartOutlined style={{ color: p.amber }} />} title="Response Time by Hour" />
            <MiniLineChart data={respData.map(v => Math.min(v, 10000))} color={p.amber} height={70} />
            <div style={{ fontSize: 11, marginTop: 8, color: p.textMuted }}>
              Max: {trafficStats?.max_response_ms ?? 0}ms | Avg: {(trafficStats?.avg_response_ms ?? 0).toFixed(0)}ms | P95: {trafficStats?.p95_response_ms ?? 0}ms
            </div>
          </div>
        </Col>
      </Row>

      {/* Top Countries + Top Clients */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <div style={sectionBox}>
            <SectionTitle icon={<GeoIcon style={{ color: p.accent }} />} title="Top Countries by Traffic" />
            {(geoStats?.top_countries ?? []).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {geoStats!.top_countries.slice(0, 8).map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 20, textAlign: 'center', fontSize: 14 }}>{flag(c.country_code)}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: p.text }}>
                        <span>{c.country_name}</span>
                        <span style={{ fontWeight: 600 }}>{c.total_requests.toLocaleString()}</span>
                      </div>
                      <div style={{ height: 3, background: `${p.accent}20`, borderRadius: 2, marginTop: 2 }}>
                        <div style={{ height: '100%', width: `${(c.total_requests / (geoStats!.top_countries[0]?.total_requests || 1)) * 100}%`, background: p.accent, borderRadius: 2 }} />
                      </div>
                    </div>
                    <Tag color="red" style={{ margin: 0, fontSize: 10 }}>{c.blocked_requests.toLocaleString()}</Tag>
                  </div>
                ))}
              </div>
            ) : <div style={{ textAlign: 'center', padding: 20, color: p.textMuted, fontSize: 12 }}>No data</div>}
          </div>
        </Col>
        <Col xs={24} lg={12}>
          <div style={sectionBox}>
            <SectionTitle icon={<WafIcons.Ip size={16} color={p.accent} />} title="Top Clients by Requests" />
            {(trafficStats?.top_clients ?? []).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {trafficStats!.top_clients.slice(0, 8).map((client, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${p.cardBorder}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: p.textMuted, width: 16 }}>{i + 1}</span>
                      <code style={{ fontSize: 12, color: p.accent }}>{client.ip}</code>
                    </div>
                    <Tag style={{ margin: 0, fontSize: 11 }}>{client.count.toLocaleString()} req</Tag>
                  </div>
                ))}
              </div>
            ) : <div style={{ textAlign: 'center', padding: 20, color: p.textMuted, fontSize: 12 }}>No data</div>}
          </div>
        </Col>
      </Row>

      {/* Slow Requests */}
      <div style={sectionBox}>
        <SectionTitle icon={<ClockCircleOutlined style={{ color: p.amber }} />} title="Slow Requests" extra={<Button size="small" icon={<ReloadOutlined />} onClick={onRefresh}>Refresh</Button>} />
        <Table dataSource={slowRequests} columns={slowColumns} rowKey="id" loading={loading}
          pagination={{ pageSize: 10 }} size="small"
          locale={{ emptyText: <Empty description="No slow requests recorded" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3: Attack Feed (Real-time)
// ---------------------------------------------------------------------------

function AttackFeedTab({ feed, geoStats, loading, onRefresh }: {
  feed: WAFAttackFeedEntry[]; geoStats: WAFGeoStats | null; loading: boolean; onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const { sectionBox, p, isDark } = useStyles();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const columns = [
    { title: 'Time', dataIndex: 'timestamp', key: 'timestamp', width: 140, render: (v: string) => <span style={{ fontSize: 11, color: p.textMuted, fontFamily: 'monospace' }}>{new Date(v).toLocaleString()}</span> },
    { title: 'IP Address', dataIndex: 'client_ip', key: 'client_ip', width: 130, render: (v: string, r: WAFAttackFeedEntry) => <div><code style={{ fontSize: 12, color: p.red, fontWeight: 600 }}>{v}</code>{r.geo_country && <div style={{ fontSize: 10, color: p.textMuted }}>{flag(r.geo_country)} {r.geo_country}</div>}</div> },
    { title: 'Method', dataIndex: 'method', key: 'method', width: 70, render: (v: string) => { const colors: Record<string, string> = { GET: 'blue', POST: 'green', PUT: 'orange', DELETE: 'red', PATCH: 'purple' }; return <Tag color={colors[v] || 'default'} style={{ margin: 0, fontSize: 10 }}>{v}</Tag>; } },
    { title: 'Domain / URI', dataIndex: 'uri', key: 'uri', ellipsis: true, render: (v: string, r: WAFAttackFeedEntry) => <div><span style={{ fontSize: 11, color: p.textMuted }}>{r.host}</span><div><code style={{ fontSize: 11 }}>{v.length > 35 ? v.substring(0, 35) + '...' : v}</code></div></div> },
    { title: 'Attack Type', dataIndex: 'rule_category', key: 'rule_category', width: 120, render: (v: string) => v ? <Tag style={{ margin: 0, fontSize: 10, background: `${categoryColor(v, p)}15`, color: categoryColor(v, p), border: `1px solid ${categoryColor(v, p)}30` }}>{attackLabel(v)}</Tag> : <span style={{ color: p.textMuted, fontSize: 11 }}>-</span> },
    { title: 'Severity', dataIndex: 'rule_severity', key: 'rule_severity', width: 90, render: (v: string) => v ? <Tag style={{ margin: 0, fontSize: 10, background: `${severityColor(v, p)}15`, color: severityColor(v, p), border: `1px solid ${severityColor(v, p)}30` }}>{v}</Tag> : <span style={{ color: p.textMuted, fontSize: 11 }}>-</span> },
    { title: 'Action', dataIndex: 'action_taken', key: 'action_taken', width: 90, render: () => <Tag color="red" style={{ margin: 0, fontSize: 10 }}>🚫 Blocked</Tag> },
    { title: '', key: 'expand', width: 40, render: (_: any, r: WAFAttackFeedEntry) => <Button size="small" icon={<EyeOutlined />} onClick={() => setExpandedId(expandedId === r.id ? null : r.id)} /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* World Map */}
      <div style={sectionBox}>
        <SectionTitle icon={<GlobalOutlined style={{ color: p.red }} />} title="Attack Origins Map"
          extra={<Badge status="processing" text={<span style={{ fontSize: 11, color: p.textMuted }}>Live (24h)</span>} />} />
        <WorldMap attackData={geoStats?.top_countries ?? []} />
      </div>

      {/* Stats */}
      <Row gutter={[12, 12]}>
        <Col xs={12} sm={6}>
          <div style={{ ...sectionBox, padding: 14, background: `${p.red}08`, border: `1px solid ${p.red}20` }}>
            <div style={{ fontSize: 11, color: p.textMuted }}>Total Blocked (24h)</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: p.red }}>{(geoStats?.top_countries.reduce((sum, c) => sum + c.blocked_requests, 0) ?? 0).toLocaleString()}</div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div style={{ ...sectionBox, padding: 14, background: `${p.accent}08`, border: `1px solid ${p.accent}20` }}>
            <div style={{ fontSize: 11, color: p.textMuted }}>Countries Attacking</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: p.accent }}>{geoStats?.total_countries ?? 0}</div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div style={{ ...sectionBox, padding: 14, background: `${p.amber}08`, border: `1px solid ${p.amber}20` }}>
            <div style={{ fontSize: 11, color: p.textMuted }}>Top Attack Source</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: p.amber }}>
              {geoStats?.blocked_by_country[0] ? `${flag(geoStats.blocked_by_country[0].country_code)} ${geoStats.blocked_by_country[0].country_name}` : '-'}
            </div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div style={{ ...sectionBox, padding: 14, background: `${p.purple}08`, border: `1px solid ${p.purple}20` }}>
            <div style={{ fontSize: 11, color: p.textMuted }}>Unique IPs Blocked</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: p.purple }}>
              {geoStats?.top_countries.reduce((sum, c) => sum + c.unique_ips, 0).toLocaleString() ?? 0}
            </div>
          </div>
        </Col>
      </Row>

      {/* Feed Table */}
      <div style={sectionBox}>
        <SectionTitle icon={<WafIcons.Activity size={16} color={p.red} />} title="Latest Blocked Requests"
          extra={<Button size="small" icon={<ReloadOutlined />} onClick={onRefresh}>Refresh</Button>} />
        <Table dataSource={feed} columns={columns} rowKey="id" loading={loading}
          expandable={{
            expandedRowKeys: expandedId ? [expandedId] : [],
            expandedRowRender: (record: WAFAttackFeedEntry) => (
              <div style={{ padding: '12px 16px', background: isDark ? p.card : '#F5F7FA', borderRadius: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Rule ID</div><code style={{ fontSize: 11, color: p.accent }}>{record.rule_id || 'N/A'}</code></div>
                  <div><div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Rule Message</div><span style={{ fontSize: 12, color: p.text }}>{record.rule_message || 'N/A'}</span></div>
                  <div><div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Anomaly Score</div><span style={{ fontSize: 12, fontWeight: 600, color: p.amber }}>{record.anomaly_score?.toFixed(1) ?? 'N/A'}</span></div>
                  <div><div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Response Code</div><Tag style={{ margin: 0 }}>{record.response_code || 'N/A'}</Tag></div>
                  {record.user_agent && <div style={{ gridColumn: '1 / -1' }}><div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>User Agent</div><code style={{ fontSize: 11, color: p.text }}>{record.user_agent}</code></div>}
                  {record.site_name && <div><div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Protected Site</div><Tag style={{ margin: 0 }}>{record.site_name}</Tag></div>}
                </div>
              </div>
            ),
          }}
          pagination={{ pageSize: 20 }}
          scroll={{ x: 900 }}
          size="small"
          locale={{ emptyText: <Empty description="No attacks detected yet" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 4: Sites Management
// ---------------------------------------------------------------------------

function SitesTab({ sites, loading, onRefresh, onCreate, onUpdate, onDelete, onToggle }: {
  sites: WAFSite[]; loading: boolean; onRefresh: () => void;
  onCreate: (values: any) => Promise<void>; onUpdate: (id: number, values: any) => Promise<void>;
  onDelete: (id: number) => Promise<void>; onToggle: (id: number, enabled: boolean) => Promise<void>;
}) {
  const { sectionBox, p, isDark } = useStyles();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WAFSite | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const openAdd = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ listen_port: 80, ssl_port: 443, max_connections: 2000, timeout_client: 30000, timeout_server: 30000, enabled: true, mode: 'blocking', ssl_enabled: false }); setModalOpen(true); };
  const openEdit = (site: WAFSite) => { setEditing(site); form.setFieldsValue(site); setModalOpen(true); };
  const handleSave = async () => {
    try { const values = await form.validateFields(); setSaving(true); editing ? await onUpdate(editing.id, values) : await onCreate(values); setModalOpen(false); } catch {} finally { setSaving(false); }
  };

  const columns = [
    { title: 'Domain', dataIndex: 'domain', key: 'domain', render: (v: string, r: WAFSite) => <div><div style={{ fontWeight: 600, color: p.text }}>{v}</div><div style={{ fontSize: 11, color: p.textMuted }}>{r.name}</div></div> },
    { title: 'Backend', dataIndex: 'backend_url', key: 'backend_url', render: (v: string) => <code style={{ fontSize: 11, color: p.accent }}>{v}</code> },
    { title: 'Port', dataIndex: 'listen_port', key: 'listen_port', width: 80, render: (v: number, r: WAFSite) => <div style={{ display: 'flex', gap: 4 }}><Tag style={{ margin: 0, fontSize: 11 }}>{v}</Tag>{r.ssl_enabled && <Tag color="green" style={{ margin: 0, fontSize: 11 }}>{r.ssl_port}</Tag>}</div> },
    { title: 'Mode', dataIndex: 'mode', key: 'mode', width: 100, render: (v: string) => <Tag color={v === 'blocking' ? 'green' : 'orange'} style={{ margin: 0 }}>{v === 'blocking' ? 'Blocking' : 'Detection'}</Tag> },
    { title: 'Rules', dataIndex: 'rules_count', key: 'rules_count', width: 70, render: (v: number) => <span style={{ fontWeight: 600, color: p.accent }}>{v}</span> },
    { title: 'Status', dataIndex: 'enabled', key: 'enabled', width: 90, render: (v: boolean, r: WAFSite) => <Switch checked={v} size="small" onChange={val => onToggle(r.id, val)} /> },
    { title: '', key: 'actions', width: 100, render: (_: any, r: WAFSite) => <Space size={4}><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /><Popconfirm title="Delete?" onConfirm={() => onDelete(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space> },
  ];

  return (
    <div>
      <div style={{ ...sectionBox, padding: '16px 24px', marginBottom: 0, borderBottom: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <SectionTitle icon={<WafIcons.Globe size={18} color={p.accent} />} title="Protected Sites" />
          <div style={{ display: 'flex', gap: 8 }}><Button icon={<ReloadOutlined />} onClick={onRefresh}>Refresh</Button><Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add Site</Button></div>
        </div>
      </div>
      <Card style={{ borderRadius: '0 0 12px 12px', borderTop: 'none' }} styles={{ body: { padding: 0 } }}>
        <Table dataSource={sites} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} />
      </Card>
      <Modal title={editing ? `Edit Site: ${editing.domain}` : 'Add Protected Site'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleSave} okText={editing ? 'Update' : 'Create'} confirmLoading={saving} width={600}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="name" label="Site Name" rules={[{ required: true }]}><Input placeholder="e.g. Production API" /></Form.Item>
            <Form.Item name="domain" label="Domain" rules={[{ required: true }]}><Input placeholder="e.g. api.example.com" /></Form.Item>
          </div>
          <Form.Item name="backend_url" label="Backend URL" rules={[{ required: true }]}><Input placeholder="http://127.0.0.1:8080" /></Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="listen_port" label="HTTP Port" rules={[{ required: true }]}><InputNumber min={1} max={65535} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="ssl_port" label="HTTPS Port"><InputNumber min={1} max={65535} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="max_connections" label="Max Connections"><InputNumber min={100} max={50000} style={{ width: '100%' }} /></Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="mode" label="WAF Mode"><Select options={[{ value: 'blocking', label: '🛡 Blocking' }, { value: 'detection', label: '🔍 Detection' }]} /></Form.Item>
            <Form.Item name="ssl_enabled" label="SSL" valuePropName="checked"><Switch /></Form.Item>
          </div>
          <Form.Item name="health_check_path" label="Health Check"><Input placeholder="/health" /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="enabled" label="Enabled" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 5: Rules Management
// ---------------------------------------------------------------------------

function RulesTab({ rules, categories, loading, onRefresh, onCreate, onUpdate, onDelete, onToggle, onToggleOWASP }: {
  rules: WAFRule[]; categories: WAFOWASPCategory[]; loading: boolean; onRefresh: () => void;
  onCreate: (values: any) => Promise<void>; onUpdate: (id: number, values: any) => Promise<void>;
  onDelete: (id: number) => Promise<void>; onToggle: (id: number, enabled: boolean) => Promise<void>;
  onToggleOWASP: (categoryId: string, enabled: boolean) => Promise<void>;
}) {
  const { sectionBox, p, isDark } = useStyles();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WAFRule | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => rules.filter(r => {
    if (filterType && r.rule_type !== filterType) return false;
    if (filterCategory && r.category !== filterCategory) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase()) && !r.rule_content.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [rules, filterType, filterCategory, search]);

  const openAdd = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ phase: 1, action: 'block', priority: 100, log_level: 'alert', rule_type: 'custom', category: 'custom', enabled: true }); setModalOpen(true); };
  const openEdit = (rule: WAFRule) => { setEditing(rule); form.setFieldsValue(rule); setModalOpen(true); };
  const handleSave = async () => {
    try { const values = await form.validateFields(); setSaving(true); editing ? await onUpdate(editing.id, values) : await onCreate(values); setModalOpen(false); } catch {} finally { setSaving(false); }
  };

  const columns = [
    { title: 'Rule Name', dataIndex: 'name', key: 'name', render: (v: string, r: WAFRule) => <div><div style={{ fontWeight: 600, color: p.text }}>{v}</div>{r.rule_group && <Tag style={{ fontSize: 10, marginTop: 2 }}>{r.rule_group}</Tag>}</div> },
    { title: 'Type', dataIndex: 'rule_type', key: 'rule_type', width: 90, render: (v: string) => <Tag color={v === 'owasp' ? 'blue' : v === 'ip_match' ? 'purple' : 'default'} style={{ margin: 0 }}>{v.toUpperCase()}</Tag> },
    { title: 'Category', dataIndex: 'category', key: 'category', width: 100, render: (v: string) => <Tag style={{ margin: 0, background: `${categoryColor(v, p)}15`, color: categoryColor(v, p), border: `1px solid ${categoryColor(v, p)}30` }}>{v}</Tag> },
    { title: 'Phase', dataIndex: 'phase', key: 'phase', width: 60, render: (v: number) => <Tag style={{ margin: 0 }}>{v}</Tag> },
    { title: 'Action', dataIndex: 'action', key: 'action', width: 80, render: (v: string) => <Tag color={v === 'block' ? 'red' : v === 'allow' ? 'green' : 'default'} style={{ margin: 0 }}>{v}</Tag> },
    { title: 'Status', dataIndex: 'enabled', key: 'enabled', width: 80, render: (v: boolean, r: WAFRule) => <Switch checked={v} size="small" onChange={val => onToggle(r.id, val)} /> },
    { title: '', key: 'actions', width: 80, render: (_: any, r: WAFRule) => <Space size={4}><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /><Popconfirm title="Delete?" onConfirm={() => onDelete(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* OWASP Categories */}
      <div style={sectionBox}>
        <SectionTitle icon={<WafIcons.Alert size={18} color={p.accent} />} title="OWASP CRS v4 Categories" />
        <Row gutter={[8, 8]}>
          {categories.map(cat => (
            <Col xs={24} sm={12} lg={8} xl={6} key={cat.category_id}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, background: cat.enabled ? `${p.green}08` : undefined, border: `1px solid ${cat.enabled ? p.green + '20' : p.cardBorder}` }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: p.text }}>{cat.name}</div>
                  <div style={{ fontSize: 10, color: p.textMuted }}>{attackLabel(cat.category_id)} · {cat.severity}</div>
                </div>
                <Switch checked={cat.enabled} size="small" onChange={v => onToggleOWASP(cat.category_id, v)} />
              </div>
            </Col>
          ))}
        </Row>
      </div>

      {/* Custom Rules */}
      <div style={sectionBox}>
        <SectionTitle icon={<WafIcons.Rule size={18} color={p.accent} />} title="Custom Rules"
          extra={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Input placeholder="Search..." prefix={<SearchOutlined />} value={search} onChange={e => setSearch(e.target.value)} allowClear style={{ width: 160, fontSize: 12 }} />
              <Select placeholder="Type" value={filterType || undefined} onChange={v => setFilterType(v || '')} allowClear style={{ width: 100 }} options={[{ value: 'custom', label: 'Custom' }, { value: 'owasp', label: 'OWASP' }, { value: 'ip_match', label: 'IP Match' }]} />
              <Select placeholder="Category" value={filterCategory || undefined} onChange={v => setFilterCategory(v || '')} allowClear style={{ width: 120 }} options={[{ value: 'SQLi', label: 'SQLi' }, { value: 'XSS', label: 'XSS' }, { value: 'LFI', label: 'LFI' }, { value: 'RCE', label: 'RCE' }, { value: 'CRLF', label: 'CRLF' }, { value: 'TRAVERSAL', label: 'Traversal' }, { value: 'custom', label: 'Custom' }]} />
              <Button icon={<ReloadOutlined />} onClick={onRefresh}>Refresh</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add Rule</Button>
            </div>
          }
        />
        <Table dataSource={filtered} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} size="small"
          locale={{ emptyText: <Empty description="No custom rules" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }} />
      </div>

      <Modal title={editing ? `Edit Rule: ${editing.name}` : 'Create Custom Rule'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleSave} okText={editing ? 'Update' : 'Create'} confirmLoading={saving} width={700}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="name" label="Rule Name" rules={[{ required: true }]}><Input placeholder="e.g. Block SQL Keywords" /></Form.Item>
            <Form.Item name="category" label="Category" rules={[{ required: true }]}><Select options={[{ value: 'SQLi', label: 'SQL Injection' }, { value: 'XSS', label: 'Cross-Site Scripting' }, { value: 'LFI', label: 'Local File Inclusion' }, { value: 'RCE', label: 'Remote Code Execution' }, { value: 'CRLF', label: 'CRLF Injection' }, { value: 'TRAVERSAL', label: 'Path Traversal' }, { value: 'custom', label: 'Custom' }]} /></Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="phase" label="Phase"><Select options={[{ value: 1, label: '1 - Request Headers' }, { value: 2, label: '2 - Request Body' }, { value: 3, label: '3 - Response Headers' }, { value: 4, label: '4 - Response Body' }]} /></Form.Item>
            <Form.Item name="action" label="Action" rules={[{ required: true }]}><Select options={[{ value: 'block', label: 'Block' }, { value: 'allow', label: 'Allow' }, { value: 'log', label: 'Log Only' }]} /></Form.Item>
            <Form.Item name="priority" label="Priority"><InputNumber min={1} max={999} style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item name="rule_content" label="Rule (SecLang)" rules={[{ required: true }]}><Input.TextArea rows={3} placeholder="ARGS @rx (?i)(union.*select|drop.*table)" style={{ fontFamily: 'monospace', fontSize: 12 }} /></Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="log_level" label="Log Level"><Select options={[{ value: 'alert', label: 'Alert' }, { value: 'critical', label: 'Critical' }, { value: 'error', label: 'Error' }, { value: 'warning', label: 'Warning' }, { value: 'notice', label: 'Notice' }]} /></Form.Item>
            <Form.Item name="rule_group" label="Rule Group"><Input placeholder="e.g. SQL Injection Detection" /></Form.Item>
          </div>
          <Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="enabled" label="Enabled" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 6: Logs
// ---------------------------------------------------------------------------

function LogsTab({ logs, loading, total, onRefresh, page, pageSize, onPageChange, filterAction, onFilterAction, filterCategory, onFilterCategory, search, onSearch }: {
  logs: WAFLogEntry[]; loading: boolean; total: number; onRefresh: () => void;
  page: number; pageSize: number; onPageChange: (page: number, pageSize: number) => void;
  filterAction: string; onFilterAction: (v: string) => void; filterCategory: string; onFilterCategory: (v: string) => void;
  search: string; onSearch: (v: string) => void;
}) {
  const { sectionBox, p, isDark } = useStyles();
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const columns = [
    { title: 'Time', dataIndex: 'timestamp', key: 'timestamp', width: 150, render: (v: string) => <span style={{ fontSize: 11, color: p.textMuted, fontFamily: 'monospace' }}>{new Date(v).toLocaleString()}</span> },
    { title: 'IP', dataIndex: 'client_ip', key: 'client_ip', width: 130, render: (v: string, r: WAFLogEntry) => <div><code style={{ fontSize: 12, color: p.accent, fontWeight: 600 }}>{v}</code>{r.geo_country && <div style={{ fontSize: 10, color: p.textMuted }}>{flag(r.geo_country)} {r.geo_country}</div>}</div> },
    { title: 'Method', dataIndex: 'method', key: 'method', width: 70, render: (v: string) => { const colors: Record<string, string> = { GET: 'blue', POST: 'green', PUT: 'orange', DELETE: 'red', PATCH: 'purple' }; return <Tag color={colors[v] || 'default'} style={{ margin: 0, fontSize: 11 }}>{v}</Tag>; } },
    { title: 'URI', dataIndex: 'uri', key: 'uri', ellipsis: true, render: (v: string) => <code style={{ fontSize: 11 }}>{v.length > 45 ? v.substring(0, 45) + '...' : v}</code> },
    { title: 'Attack', dataIndex: 'rule_category', key: 'rule_category', width: 120, render: (v: string) => v ? <Tag style={{ margin: 0, fontSize: 10, background: `${categoryColor(v, p)}15`, color: categoryColor(v, p), border: `1px solid ${categoryColor(v, p)}30` }}>{attackLabel(v)}</Tag> : <span style={{ color: p.textMuted, fontSize: 11 }}>-</span> },
    { title: 'Severity', dataIndex: 'rule_severity', key: 'rule_severity', width: 90, render: (v: string) => v ? <Tag style={{ margin: 0, fontSize: 10, background: `${severityColor(v, p)}15`, color: severityColor(v, p), border: `1px solid ${severityColor(v, p)}30` }}>{v}</Tag> : <span style={{ color: p.textMuted, fontSize: 11 }}>-</span> },
    { title: 'Anomaly', dataIndex: 'anomaly_score', key: 'anomaly_score', width: 80, render: (v: number) => v ? <span style={{ fontWeight: 600, color: v > 5 ? p.red : v > 3 ? p.amber : p.accent, fontSize: 12 }}>{v.toFixed(1)}</span> : <span style={{ color: p.textMuted, fontSize: 11 }}>-</span> },
    { title: 'Action', dataIndex: 'action_taken', key: 'action_taken', width: 90, render: (v: string) => <Tag color={v === 'blocked' ? 'red' : v === 'allowed' ? 'green' : 'default'} style={{ margin: 0 }}>{v === 'blocked' ? '🚫 Blocked' : v === 'allowed' ? '✓ Allowed' : v}</Tag> },
    { title: '', key: 'expand', width: 40, render: (_: any, r: WAFLogEntry) => <Button size="small" icon={<EyeOutlined />} onClick={() => setExpandedRow(expandedRow === r.id ? null : r.id)} /> },
  ];

  return (
    <div style={sectionBox}>
      <SectionTitle icon={<WafIcons.Log size={18} color={p.accent} />} title="WAF Audit Logs"
        extra={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Select value={filterAction || undefined} onChange={v => onFilterAction(v || '')} allowClear placeholder="Action" style={{ width: 110 }} options={[{ value: 'blocked', label: 'Blocked' }, { value: 'allowed', label: 'Allowed' }]} />
            <Select value={filterCategory || undefined} onChange={v => onFilterCategory(v || '')} allowClear placeholder="Attack Type" style={{ width: 130 }} options={[{ value: 'SQLi', label: 'SQLi' }, { value: 'XSS', label: 'XSS' }, { value: 'LFI', label: 'LFI' }, { value: 'RCE', label: 'RCE' }, { value: 'CRLF', label: 'CRLF' }, { value: 'TRAVERSAL', label: 'Traversal' }]} />
            <Input placeholder="Search IP/URI..." prefix={<SearchOutlined />} value={search} onChange={e => onSearch(e.target.value)} allowClear style={{ width: 180, fontSize: 12 }} />
            <Button icon={<ReloadOutlined />} onClick={onRefresh}>Refresh</Button>
          </div>
        }
      />
      <Table dataSource={logs} columns={columns} rowKey="id" loading={loading}
        expandable={{
          expandedRowKeys: expandedRow ? [expandedRow] : [],
          expandedRowRender: (record: WAFLogEntry) => (
            <div style={{ padding: '12px 16px', background: isDark ? p.card : '#F5F7FA', borderRadius: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Rule ID</div><code style={{ fontSize: 11, color: p.accent }}>{record.rule_id || 'N/A'}</code></div>
                <div><div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Rule Message</div><span style={{ fontSize: 12 }}>{record.rule_message || 'N/A'}</span></div>
                {record.user_agent && <div style={{ gridColumn: '1 / -1' }}><div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>User Agent</div><code style={{ fontSize: 11 }}>{record.user_agent}</code></div>}
                {record.referer && <div style={{ gridColumn: '1 / -1' }}><div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Referer</div><code style={{ fontSize: 11 }}>{record.referer}</code></div>}
                {record.matched_data && <div style={{ gridColumn: '1 / -1' }}><div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Matched Data</div><code style={{ fontSize: 11, color: p.red, background: `${p.red}10`, padding: '2px 6px', borderRadius: 4 }}>{record.matched_data}</code></div>}
              </div>
            </div>
          ),
        }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `${t} entries`, onChange: onPageChange }}
        scroll={{ x: 950 }} size="small"
        locale={{ emptyText: <Empty description="No log entries found" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 7: Lists Management (IP, URI, LUA, UA)
// ---------------------------------------------------------------------------

function ListsTab({ ipEntries, uriEntries, luaEntries, uaEntries, loading, onAddIP, onRemoveIP, onUpdateIP, onClearHits, onAddURI, onRemoveURI, onToggleURI, onAddLua, onUpdateLua, onDeleteLua, onToggleLua, onAddUA, onRemoveUA, onToggleUA }: {
  ipEntries: WAFIPEntry[]; uriEntries: WAFURIEntry[]; luaEntries: WAFLuaScript[]; uaEntries: WAFUAEntry[];
  loading: boolean;
  onAddIP: (ip: string, type: string, description?: string) => Promise<void>; onRemoveIP: (id: number) => Promise<void>; onUpdateIP: (id: number, desc: string) => Promise<void>; onClearHits: (id: number) => Promise<void>;
  onAddURI: (uri: string, type: string, action: string, desc?: string) => Promise<void>; onRemoveURI: (id: number) => Promise<void>; onToggleURI: (id: number, enabled: boolean) => Promise<void>;
  onAddLua: (values: any) => Promise<void>; onUpdateLua: (id: number, values: any) => Promise<void>; onDeleteLua: (id: number) => Promise<void>; onToggleLua: (id: number, enabled: boolean) => Promise<void>;
  onAddUA: (ua: string, type: string, desc?: string) => Promise<void>; onRemoveUA: (id: number) => Promise<void>; onToggleUA: (id: number, enabled: boolean) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { sectionBox, p, isDark } = useStyles();
  const [subTab, setSubTab] = useState<'ip' | 'uri' | 'lua' | 'ua'>('ip');
  const [ipModalOpen, setIPModalOpen] = useState(false);
  const [ipType, setIPType] = useState('whitelist');
  const [newIP, setNewIP] = useState('');
  const [ipDesc, setIPDesc] = useState('');
  const [ipAdding, setIPAdding] = useState(false);
  const [uriModalOpen, setURIModalOpen] = useState(false);
  const [uriType, setURIType] = useState('whitelist');
  const [newURI, setNewURI] = useState('');
  const [newURIAction, setNewURIAction] = useState('block');
  const [uriDesc, setURIDesc] = useState('');
  const [luaModalOpen, setLuaModalOpen] = useState(false);
  const [editingLua, setEditingLua] = useState<WAFLuaScript | null>(null);
  const [luaForm] = Form.useForm();
  const [uaModalOpen, setUAModalOpen] = useState(false);
  const [uaType, setUAType] = useState('whitelist');
  const [newUA, setNewUA] = useState('');
  const [uaDesc, setUADesc] = useState('');

  const handleAddIP = async () => { if (!newIP.trim()) return; setIPAdding(true); try { await onAddIP(newIP.trim(), ipType, ipDesc); setNewIP(''); setIPDesc(''); setIPModalOpen(false); } finally { setIPAdding(false); } };
  const handleAddURI = async () => { if (!newURI.trim()) return; await onAddURI(newURI.trim(), uriType, newURIAction, uriDesc); setNewURI(''); setURIDesc(''); setURIModalOpen(false); };
  const handleAddUA = async () => { if (!newUA.trim()) return; await onAddUA(newUA.trim(), uaType, uaDesc); setNewUA(''); setUADesc(''); setUAModalOpen(false); };
  const handleSaveLua = async () => { const values = await luaForm.validateFields(); editingLua ? await onUpdateLua(editingLua.id, values) : await onAddLua(values); setLuaModalOpen(false); };

  const ipCols = [
    { title: 'IP / CIDR', dataIndex: 'ip_address', key: 'ip_address', render: (v: string, r: WAFIPEntry) => <div><code style={{ fontSize: 12, color: p.accent }}>{v}</code>{r.is_cidr && <Tag style={{ marginLeft: 4, fontSize: 10 }}>CIDR</Tag>}</div> },
    { title: 'Type', dataIndex: 'list_type', key: 'list_type', width: 100, render: (v: string) => <Tag color={v === 'whitelist' ? 'green' : 'red'} style={{ margin: 0, fontSize: 10 }}>{v}</Tag> },
    { title: 'Hits', dataIndex: 'hit_count', key: 'hit_count', width: 70, render: (v: number) => <span style={{ fontWeight: 600, color: v > 10 ? p.red : p.text }}>{v}</span> },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true, render: (v: string) => <span style={{ fontSize: 11, color: p.textMuted }}>{v || '-'}</span> },
    { title: 'Source', dataIndex: 'source', key: 'source', width: 80, render: (v: string) => <Tag style={{ margin: 0, fontSize: 10 }}>{v}</Tag> },
    { title: '', key: 'actions', width: 100, render: (_: any, r: WAFIPEntry) => <Space size={4}><Button size="small" icon={<ReloadOutlined />} title="Clear hits" onClick={() => onClearHits(r.id)} /><Popconfirm title="Delete?" onConfirm={() => onRemoveIP(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space> },
  ];

  const uriCols = [
    { title: 'URI Pattern', dataIndex: 'uri_pattern', key: 'uri_pattern', render: (v: string) => <code style={{ fontSize: 11, color: p.accent }}>{v}</code> },
    { title: 'Type', dataIndex: 'list_type', key: 'list_type', width: 100, render: (v: string) => <Tag color={v === 'whitelist' ? 'green' : 'red'} style={{ margin: 0, fontSize: 10 }}>{v}</Tag> },
    { title: 'Action', dataIndex: 'action', key: 'action', width: 80, render: (v: string) => <Tag color={v === 'block' ? 'red' : 'green'} style={{ margin: 0, fontSize: 10 }}>{v}</Tag> },
    { title: 'Priority', dataIndex: 'priority', key: 'priority', width: 70, render: (v: number) => <span style={{ fontSize: 11, color: p.textMuted }}>{v}</span> },
    { title: 'Status', dataIndex: 'enabled', key: 'enabled', width: 80, render: (v: boolean, r: WAFURIEntry) => <Switch checked={v} size="small" onChange={val => onToggleURI(r.id, val)} /> },
    { title: '', key: 'actions', width: 80, render: (_: any, r: WAFURIEntry) => <Popconfirm title="Delete?" onConfirm={() => onRemoveURI(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm> },
  ];

  const luaCols = [
    { title: 'Name', dataIndex: 'name', key: 'name', render: (v: string, r: WAFLuaScript) => <div><div style={{ fontWeight: 600, color: p.text }}>{v}</div>{r.description && <div style={{ fontSize: 10, color: p.textMuted }}>{r.description}</div>}</div> },
    { title: 'Priority', dataIndex: 'priority', key: 'priority', width: 70, render: (v: number) => <Tag style={{ margin: 0, fontSize: 10 }}>{v}</Tag> },
    { title: 'Status', dataIndex: 'enabled', key: 'enabled', width: 80, render: (v: boolean, r: WAFLuaScript) => <Switch checked={v} size="small" onChange={val => onToggleLua(r.id, val)} /> },
    { title: '', key: 'actions', width: 120, render: (_: any, r: WAFLuaScript) => <Space size={4}><Button size="small" icon={<EditOutlined />} onClick={() => { setEditingLua(r); luaForm.setFieldsValue(r); setLuaModalOpen(true); }} /><Popconfirm title="Delete?" onConfirm={() => onDeleteLua(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space> },
  ];

  const uaCols = [
    { title: 'User-Agent Pattern', dataIndex: 'ua_pattern', key: 'ua_pattern', render: (v: string) => <code style={{ fontSize: 11 }}>{v.length > 40 ? v.substring(0, 40) + '...' : v}</code> },
    { title: 'Type', dataIndex: 'list_type', key: 'list_type', width: 100, render: (v: string) => <Tag color={v === 'whitelist' ? 'green' : 'red'} style={{ margin: 0, fontSize: 10 }}>{v}</Tag> },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true, render: (v: string) => <span style={{ fontSize: 11, color: p.textMuted }}>{v || '-'}</span> },
    { title: 'Status', dataIndex: 'enabled', key: 'enabled', width: 80, render: (v: boolean, r: WAFUAEntry) => <Switch checked={v} size="small" onChange={val => onToggleUA(r.id, val)} /> },
    { title: '', key: 'actions', width: 80, render: (_: any, r: WAFUAEntry) => <Popconfirm title="Delete?" onConfirm={() => onRemoveUA(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm> },
  ];

  const subTabs = [
    { key: 'ip' as const, label: `IP Lists (${ipEntries.length})`, icon: <WafIcons.Ip size={12} /> },
    { key: 'uri' as const, label: `URI Lists (${uriEntries.length})`, icon: <WafIcons.List size={12} /> },
    { key: 'lua' as const, label: `LUA Scripts (${luaEntries.length})`, icon: <WafIcons.Code size={12} /> },
    { key: 'ua' as const, label: `User-Agent (${uaEntries.length})`, icon: <GlobalOutlined /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {subTabs.map(tab => (
          <button key={tab.key} onClick={() => setSubTab(tab.key)} style={{ padding: '6px 16px', borderRadius: 6, border: subTab === tab.key ? `1px solid ${p.accent}40` : `1px solid ${p.cardBorder}`, cursor: 'pointer', fontSize: 12, fontWeight: 600, background: subTab === tab.key ? `${p.accent}15` : 'transparent', color: subTab === tab.key ? p.accent : p.textMuted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* IP Lists */}
      {subTab === 'ip' && (
        <div style={sectionBox}>
          <SectionTitle icon={<WafIcons.Ip size={18} color={p.accent} />} title="IP Whitelist & Blacklist"
            extra={<div style={{ display: 'flex', gap: 8 }}><Button size="small" icon={<PlusOutlined />} onClick={() => { setIPType('whitelist'); setIPModalOpen(true); }}>Whitelist</Button><Button size="small" danger icon={<PlusOutlined />} onClick={() => { setIPType('blacklist'); setIPModalOpen(true); }}>Blacklist</Button></div>}
          />
          <Table dataSource={ipEntries} columns={ipCols} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} size="small"
            locale={{ emptyText: <Empty description="No IP entries" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }} />
        </div>
      )}

      {/* URI Lists */}
      {subTab === 'uri' && (
        <div style={sectionBox}>
          <SectionTitle icon={<WafIcons.List size={18} color={p.accent} />} title="URI Whitelist & Blacklist"
            extra={<div style={{ display: 'flex', gap: 8 }}><Button size="small" icon={<PlusOutlined />} onClick={() => { setURIType('whitelist'); setNewURIAction('allow'); setURIModalOpen(true); }}>Whitelist URI</Button><Button size="small" danger icon={<PlusOutlined />} onClick={() => { setURIType('blacklist'); setNewURIAction('block'); setURIModalOpen(true); }}>Block URI</Button></div>}
          />
          <Table dataSource={uriEntries} columns={uriCols} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} size="small"
            locale={{ emptyText: <Empty description="No URI entries" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }} />
        </div>
      )}

      {/* LUA Scripts */}
      {subTab === 'lua' && (
        <div style={sectionBox}>
          <SectionTitle icon={<WafIcons.Code size={18} color={p.accent} />} title="LUA Scripts for HAProxy"
            extra={<Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => { setEditingLua(null); luaForm.resetFields(); luaForm.setFieldsValue({ enabled: true, priority: 100 }); setLuaModalOpen(true); }}>Add Script</Button>}
          />
          <Table dataSource={luaEntries} columns={luaCols} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} size="small"
            expandable={{ expandedRowRender: (r: WAFLuaScript) => <pre style={{ fontSize: 11, background: isDark ? '#1a1a2e' : '#f5f5f5', padding: 12, borderRadius: 6, overflow: 'auto', maxHeight: 200 }}>{r.script_content}</pre> }}
            locale={{ emptyText: <Empty description="No LUA scripts" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }} />
        </div>
      )}

      {/* User-Agent Lists */}
      {subTab === 'ua' && (
        <div style={sectionBox}>
          <SectionTitle icon={<GlobalOutlined style={{ color: p.accent }} />} title="User-Agent Whitelist & Blacklist"
            extra={<div style={{ display: 'flex', gap: 8 }}><Button size="small" icon={<PlusOutlined />} onClick={() => { setUAType('whitelist'); setUAModalOpen(true); }}>Allow UA</Button><Button size="small" danger icon={<PlusOutlined />} onClick={() => { setUAType('blacklist'); setUAModalOpen(true); }}>Block UA</Button></div>}
          />
          <Table dataSource={uaEntries} columns={uaCols} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} size="small"
            locale={{ emptyText: <Empty description="No User-Agent entries" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }} />
        </div>
      )}

      {/* Modals */}
      <Modal title={`Add IP to ${ipType === 'whitelist' ? 'Whitelist' : 'Blacklist'}`} open={ipModalOpen} onCancel={() => setIPModalOpen(false)} onOk={handleAddIP} okText="Add" confirmLoading={ipAdding}>
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 12 }}><div style={{ fontSize: 12, color: p.textMuted, marginBottom: 4 }}>IP Address or CIDR</div><Input value={newIP} onChange={e => setNewIP(e.target.value)} placeholder="e.g. 192.168.1.0/24" /></div>
          <div><div style={{ fontSize: 12, color: p.textMuted, marginBottom: 4 }}>Description</div><Input value={ipDesc} onChange={e => setIPDesc(e.target.value)} placeholder="Optional note" /></div>
        </div>
      </Modal>

      <Modal title={`${uriType === 'whitelist' ? 'Whitelist' : 'Block'} URI`} open={uriModalOpen} onCancel={() => setURIModalOpen(false)} onOk={handleAddURI} okText="Add">
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 12 }}><div style={{ fontSize: 12, color: p.textMuted, marginBottom: 4 }}>URI Pattern</div><Input value={newURI} onChange={e => setNewURI(e.target.value)} placeholder="e.g. /admin/* or /api/private" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><div style={{ fontSize: 12, color: p.textMuted, marginBottom: 4 }}>List Type</div><Select value={uriType} onChange={v => setURIType(v)} options={[{ value: 'whitelist', label: 'Whitelist' }, { value: 'blacklist', label: 'Blacklist' }]} /></div>
            <div><div style={{ fontSize: 12, color: p.textMuted, marginBottom: 4 }}>Action</div><Select value={newURIAction} onChange={v => setNewURIAction(v)} options={[{ value: 'block', label: 'Block' }, { value: 'allow', label: 'Allow' }]} /></div>
          </div>
          <div style={{ marginTop: 12 }}><div style={{ fontSize: 12, color: p.textMuted, marginBottom: 4 }}>Description</div><Input value={uriDesc} onChange={e => setURIDesc(e.target.value)} placeholder="Optional note" /></div>
        </div>
      </Modal>

      <Modal title={editingLua ? `Edit LUA Script: ${editingLua.name}` : 'Add LUA Script'} open={luaModalOpen} onCancel={() => setLuaModalOpen(false)} onOk={handleSaveLua} okText={editingLua ? 'Update' : 'Create'} width={700}>
        <Form form={luaForm} layout="vertical" style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="name" label="Script Name" rules={[{ required: true }]}><Input placeholder="e.g. Rate Limiter" /></Form.Item>
            <Form.Item name="priority" label="Priority"><InputNumber min={1} max={999} style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item name="description" label="Description"><Input.TextArea rows={2} placeholder="What this script does..." /></Form.Item>
          <Form.Item name="script_content" label="LUA Script" rules={[{ required: true }]}
            extra={<span style={{ fontSize: 11, color: p.textMuted }}>HAProxy LUA API code</span>}>
            <Input.TextArea rows={8} placeholder="core.register_action(...)" style={{ fontFamily: 'monospace', fontSize: 11 }} />
          </Form.Item>
          <Form.Item name="enabled" label="Enabled" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>

      <Modal title={`${uaType === 'whitelist' ? 'Allow' : 'Block'} User-Agent`} open={uaModalOpen} onCancel={() => setUAModalOpen(false)} onOk={handleAddUA} okText="Add">
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 12 }}><div style={{ fontSize: 12, color: p.textMuted, marginBottom: 4 }}>User-Agent Pattern</div><Input value={newUA} onChange={e => setNewUA(e.target.value)} placeholder="e.g. curl/* or python-requests/*" /></div>
          <div><div style={{ fontSize: 12, color: p.textMuted, marginBottom: 4 }}>Description</div><Input value={uaDesc} onChange={e => setUADesc(e.target.value)} placeholder="Optional note" /></div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 8: Settings
// ---------------------------------------------------------------------------

function SettingsTab({ settings, loading, onSave }: {
  settings: WAFSettings | null; loading: boolean; onSave: (values: any) => Promise<void>;
}) {
  const { sectionBox, p, isDark } = useStyles();
  const [form] = Form.useForm();

  useEffect(() => { if (settings) form.setFieldsValue(settings); }, [settings, form]);

  const countryOptions = [
    { value: 'CN', label: '🇨🇳 China' }, { value: 'RU', label: '🇷🇺 Russia' }, { value: 'KR', label: '🇰🇷 North Korea' }, { value: 'IR', label: '🇮🇷 Iran' },
    { value: 'BY', label: '🇧🇾 Belarus' }, { value: 'NG', label: '🇳🇬 Nigeria' }, { value: 'IN', label: '🇮🇳 India' }, { value: 'PK', label: '🇵🇰 Pakistan' },
    { value: 'VN', label: '🇻🇳 Vietnam' }, { value: 'US', label: '🇺🇸 United States' }, { value: 'DE', label: '🇩🇪 Germany' }, { value: 'GB', label: '🇬🇧 United Kingdom' },
    { value: 'JP', label: '🇯🇵 Japan' }, { value: 'SG', label: '🇸🇬 Singapore' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={sectionBox}>
        <SectionTitle icon={<WafIcons.Shield size={18} color={p.accent} />} title="WAF Mode" />
        <Form form={form} layout="vertical" onValuesChange={(_, v) => onSave(v)}>
          <Form.Item name="global_mode" label="Protection Mode">
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${p.cardBorder}` }}>
              {['blocking', 'detection'].map(mode => (
                <button key={mode} type="button" onClick={() => form.setFieldValue('global_mode', mode)} style={{ padding: '8px 24px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, background: form.getFieldValue('global_mode') === mode ? p.accent : 'transparent', color: form.getFieldValue('global_mode') === mode ? '#fff' : p.textMuted, borderRight: mode === 'blocking' ? `1px solid ${p.cardBorder}` : 'none' }}>
                  {mode === 'blocking' ? '🛡 Blocking' : '🔍 Detection'}
                </button>
              ))}
            </div>
          </Form.Item>
        </Form>
      </div>

      <div style={sectionBox}>
        <SectionTitle icon={<WafIcons.Alert size={18} color={p.accent} />} title="OWASP CRS v4 Configuration" />
        <Form form={form} layout="vertical" onValuesChange={(_, v) => onSave(v)}>
          <Form.Item name="owasp_rules_enabled" label="Enable OWASP Rules" valuePropName="checked">
            <Switch checked={settings?.owasp_rules_enabled} onChange={v => onSave({ ...settings, owasp_rules_enabled: v })} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: p.textMuted, marginBottom: 4 }}>Ruleset Version</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: p.text }}>{settings?.owasp_ruleset_version || '4.0.0'}</div>
            </div>
            <Form.Item name="anomaly_threshold" label={<span>Global Anomaly Threshold <span style={{ fontSize: 11, color: p.textMuted, fontWeight: 400 }}>(lower = stricter)</span></span>}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <InputNumber min={1} max={10} value={settings?.anomaly_threshold || 5} onChange={v => onSave({ ...settings, anomaly_threshold: v })} style={{ width: 80 }} />
                <span style={{ fontSize: 12, color: p.textMuted }}>1-10 scale</span>
              </div>
            </Form.Item>
          </div>
          <Form.Item name="paranoia_level" label={<span>Paranoia Level <span style={{ fontSize: 11, color: p.textMuted, fontWeight: 400 }}>(higher = more false positives)</span></span>}>
            <Select value={settings?.paranoia_level || 1} onChange={v => onSave({ ...settings, paranoia_level: v })} options={[{ value: 1, label: 'Level 1 (Default)' }, { value: 2, label: 'Level 2' }, { value: 3, label: 'Level 3' }, { value: 4, label: 'Level 4 (Paranoid)' }]} />
          </Form.Item>
          <div style={{ padding: '12px 16px', background: `${p.accent}08`, borderRadius: 8, fontSize: 12, color: p.textMuted }}>
            <strong>Anomaly Scoring:</strong> Each OWASP rule contributes a score to the request. When the total exceeds the threshold, the request is blocked. Recommended: threshold 5 + paranoia level 1 for most deployments.
          </div>
        </Form>
      </div>

      <div style={sectionBox}>
        <SectionTitle icon={<WafIcons.Log size={18} color={p.accent} />} title="Logging Settings" />
        <Form form={form} layout="vertical" onValuesChange={(_, v) => onSave(v)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="log_requests" label="Log Mode"><Select value={settings?.log_requests || 'blocked'} onChange={v => onSave({ ...settings, log_requests: v })} options={[{ value: 'all', label: 'Log All Requests' }, { value: 'blocked', label: 'Log Blocked Only' }, { value: 'none', label: 'No Logging' }]} /></Form.Item>
            <Form.Item name="log_retention_days" label="Retention (days)"><InputNumber min={1} max={365} value={settings?.log_retention_days || 30} onChange={v => onSave({ ...settings, log_retention_days: v })} style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item name="log_request_body" label="Log Request Bodies" valuePropName="checked"><Switch checked={settings?.log_request_body} onChange={v => onSave({ ...settings, log_request_body: v })} /></Form.Item>
        </Form>
      </div>

      <div style={sectionBox}>
        <SectionTitle icon={<WafIcons.Globe size={18} color={p.accent} />} title="Geo Blocking" />
        <Form form={form} layout="vertical">
          <Form.Item name="geo_blocking_enabled" label="Enable Geo Blocking" valuePropName="checked"><Switch checked={settings?.geo_blocking_enabled} onChange={v => onSave({ ...settings, geo_blocking_enabled: v })} /></Form.Item>
          {settings?.geo_blocking_enabled && (
            <div>
              <div style={{ fontSize: 12, color: p.textMuted, marginBottom: 8 }}>Blocked Countries</div>
              <Select mode="multiple" placeholder="Select countries..." style={{ width: '100%' }} options={countryOptions} value={settings.geo_blocked_countries} onChange={v => onSave({ ...settings, geo_blocked_countries: v })} />
            </div>
          )}
        </Form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main WAF Page
// ---------------------------------------------------------------------------

type WAFTab = 'overview' | 'traffic' | 'feed' | 'sites' | 'rules' | 'logs' | 'lists' | 'settings';

export default function WAF() {
  const { t } = useTranslation();
  const { p, isDark } = usePalette();
  const isMobile = useIsMobile();

  // Status & Stats
  const [status, setStatus] = useState<WAFStatus | null>(null);
  const [stats, setStats] = useState<WAFStats | null>(null);
  const [trafficStats, setTrafficStats] = useState<WAFTrafficStats | null>(null);
  const [geoStats, setGeoStats] = useState<WAFGeoStats | null>(null);
  const [slowRequests, setSlowRequests] = useState<WAFSlowRequest[]>([]);
  const [attackFeed, setAttackFeed] = useState<WAFAttackFeedEntry[]>([]);
  const [statusLoading, setStatusLoading] = useState(true);

  // Sites
  const [sites, setSites] = useState<WAFSite[]>([]);
  const [sitesLoading, setSitesLoading] = useState(false);

  // Rules
  const [rules, setRules] = useState<WAFRule[]>([]);
  const [categories, setCategories] = useState<WAFOWASPCategory[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);

  // Logs
  const [logs, setLogs] = useState<WAFLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logsPageSize, setLogsPageSize] = useState(50);
  const [filterAction, setFilterAction] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [logsSearch, setLogsSearch] = useState('');

  // Lists
  const [ipEntries, setIPEntries] = useState<WAFIPEntry[]>([]);
  const [uriEntries, setURIEntries] = useState<WAFURIEntry[]>([]);
  const [luaEntries, setLuaEntries] = useState<WAFLuaScript[]>([]);
  const [uaEntries, setUAEntries] = useState<WAFUAEntry[]>([]);
  const [listsLoading, setListsLoading] = useState(false);

  // Settings
  const [settings, setSettings] = useState<WAFSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);

  // UI State
  const [activeTab, setActiveTab] = useState<WAFTab>('overview');
  const [installing, setInstalling] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [restarting, setRestarting] = useState(false);

  // Fetch Status
  const fetchStatus = useCallback(async () => {
    try { const { data } = await api.get<ApiResponse<WAFStatus>>('/waf/status'); setStatus(data.data); }
    catch { setStatus({ installed: false, running: false } as WAFStatus); }
    finally { setStatusLoading(false); }
  }, []);

  // Fetch Stats + Traffic + Geo + Feed
  const fetchStats = useCallback(async () => {
    try {
      const [statsRes, trafficRes, geoRes, feedRes, slowRes] = await Promise.all([
        api.get<ApiResponse<WAFStats>>('/waf/logs/stats'),
        api.get<ApiResponse<WAFTrafficStats>>('/waf/traffic'),
        api.get<ApiResponse<WAFGeoStats>>('/waf/geo-stats'),
        api.get<ApiResponse<WAFAttackFeedEntry[]>>('/waf/attack-feed', { params: { limit: 50 } }),
        api.get<ApiResponse<WAFSlowRequest[]>>('/waf/slow-requests', { params: { limit: 50 } }),
      ]);
      setStats(statsRes.data.data);
      setTrafficStats(trafficRes.data.data);
      setGeoStats(geoRes.data.data);
      setAttackFeed(feedRes.data.data || []);
      setSlowRequests(slowRes.data.data || []);
    } catch {}
  }, []);

  // Fetch Sites
  const fetchSites = useCallback(async () => {
    setSitesLoading(true);
    try { const { data } = await api.get<ApiResponse<WAFSite[]>>('/waf/sites'); setSites(data.data || []); }
    catch { message.error(t('common.error')); }
    finally { setSitesLoading(false); }
  }, [t]);

  // Fetch Rules
  const fetchRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const [rulesRes, catsRes] = await Promise.all([
        api.get<ApiResponse<WAFRule[]>>('/waf/rules'),
        api.get<ApiResponse<WAFOWASPCategory[]>>('/waf/rules/owasp'),
      ]);
      setRules(rulesRes.data.data || []);
      setCategories(catsRes.data.data || []);
    } catch { message.error(t('common.error')); }
    finally { setRulesLoading(false); }
  }, [t]);

  // Fetch Logs
  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const params: any = { page: logsPage, page_size: logsPageSize };
      if (filterAction) params.action = filterAction;
      if (filterCategory) params.category = filterCategory;
      if (logsSearch) params.search = logsSearch;
      const resp = await api.get<PaginatedResponse<WAFLogEntry>>('/waf/logs', { params });
      setLogs(resp.data.data || []);
      setLogsTotal(resp.data.pagination?.total || 0);
    } catch { message.error(t('common.error')); }
    finally { setLogsLoading(false); }
  }, [t, logsPage, logsPageSize, filterAction, filterCategory, logsSearch]);

  // Fetch Lists
  const fetchLists = useCallback(async () => {
    setListsLoading(true);
    try {
      const [ipRes, uriRes, luaRes, uaRes] = await Promise.all([
        api.get<ApiResponse<WAFIPEntry[]>>('/waf/ip'),
        api.get<ApiResponse<WAFURIEntry[]>>('/waf/uri'),
        api.get<ApiResponse<WAFLuaScript[]>>('/waf/lua'),
        api.get<ApiResponse<WAFUAEntry[]>>('/waf/ua'),
      ]);
      setIPEntries(ipRes.data.data || []);
      setURIEntries(uriRes.data.data || []);
      setLuaEntries(luaRes.data.data || []);
      setUAEntries(uaRes.data.data || []);
    } catch { message.error(t('common.error')); }
    finally { setListsLoading(false); }
  }, []);

  // Fetch Settings
  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true);
    try { const { data } = await api.get<ApiResponse<WAFSettings>>('/waf/settings'); setSettings(data.data); }
    catch { message.error(t('common.error')); }
    finally { setSettingsLoading(false); }
  }, [t]);

  // Initial load
  useEffect(() => { fetchStatus(); fetchStats(); }, [fetchStatus, fetchStats]);

  // Tab-specific loading
  useEffect(() => {
    if (activeTab === 'sites') fetchSites();
    if (activeTab === 'rules') fetchRules();
    if (activeTab === 'logs') fetchLogs();
    if (activeTab === 'lists') fetchLists();
    if (activeTab === 'settings') fetchSettings();
  }, [activeTab, fetchSites, fetchRules, fetchLogs, fetchLists, fetchSettings]);

  // Handlers
  const handleInstall = async () => { setInstalling(true); try { await api.post('/waf/install'); message.success('WAF installed'); await fetchStatus(); await fetchStats(); } catch (e: any) { message.error(e?.response?.data?.message || 'Failed'); } finally { setInstalling(false); } };
  const handleRestart = async () => { setRestarting(true); try { await api.post('/waf/restart'); message.success('WAF restarted'); await fetchStatus(); } catch { message.error('Failed'); } finally { setRestarting(false); } };
  const handleToggleMode = async (blocking: boolean) => { setToggling(true); try { await api.put('/waf/settings', { ...settings, global_mode: blocking ? 'blocking' : 'detection' }); message.success(blocking ? 'Blocking mode' : 'Detection mode'); await fetchStatus(); } catch { message.error('Failed'); } finally { setToggling(false); } };
  const handleTabClick = (key: WAFTab) => { if (key === 'overview' || (status?.installed && status?.running)) setActiveTab(key); else message.warning('Install WAF first'); };

  // Site CRUD
  const handleCreateSite = async (values: any) => { await api.post('/waf/sites', values); message.success('Site added'); await fetchSites(); };
  const handleUpdateSite = async (id: number, values: any) => { await api.put(`/waf/sites/${id}`, values); message.success('Site updated'); await fetchSites(); };
  const handleDeleteSite = async (id: number) => { await api.delete(`/waf/sites/${id}`); message.success('Site deleted'); await fetchSites(); };
  const handleToggleSite = async (id: number, enabled: boolean) => { await api.put(`/waf/sites/${id}/toggle`, { enabled }); message.success(enabled ? 'Enabled' : 'Disabled'); await fetchSites(); };

  // Rule CRUD
  const handleCreateRule = async (values: any) => { await api.post('/waf/rules', values); message.success('Rule created'); await fetchRules(); };
  const handleUpdateRule = async (id: number, values: any) => { await api.put(`/waf/rules/${id}`, values); message.success('Rule updated'); await fetchRules(); };
  const handleDeleteRule = async (id: number) => { await api.delete(`/waf/rules/${id}`); message.success('Rule deleted'); await fetchRules(); };
  const handleToggleRule = async (id: number, enabled: boolean) => { await api.put(`/waf/rules/${id}/toggle`, { enabled }); message.success(enabled ? 'Rule enabled' : 'Rule disabled'); await fetchRules(); };
  const handleToggleOWASP = async (categoryId: string, enabled: boolean) => { await api.put(`/waf/rules/owasp/${categoryId}`, { enabled }); message.success(`OWASP ${categoryId} ${enabled ? 'enabled' : 'disabled'}`); await fetchRules(); };

  // Lists handlers
  const handleAddIP = async (ip: string, type: string, description?: string) => { await api.post('/waf/ip', { ip_address: ip, list_type: type, description }); message.success('IP added'); await fetchLists(); };
  const handleRemoveIP = async (id: number) => { await api.delete(`/waf/ip/${id}`); message.success('IP removed'); await fetchLists(); };
  const handleUpdateIP = async (id: number, description?: string) => { await api.put(`/waf/ip/${id}`, { description }); message.success('IP updated'); await fetchLists(); };
  const handleClearHits = async (id: number) => { await api.post(`/waf/ip/${id}/clear-hits`); message.success('Hits cleared'); await fetchLists(); };
  const handleAddURI = async (uri: string, type: string, action: string, description?: string) => { await api.post('/waf/uri', { uri_pattern: uri, list_type: type, action, description }); message.success('URI added'); await fetchLists(); };
  const handleRemoveURI = async (id: number) => { await api.delete(`/waf/uri/${id}`); message.success('URI removed'); await fetchLists(); };
  const handleToggleURI = async (id: number, enabled: boolean) => { await api.put(`/waf/uri/${id}/toggle`, { enabled }); await fetchLists(); };
  const handleAddLua = async (values: any) => { await api.post('/waf/lua', values); message.success('LUA script created'); await fetchLists(); };
  const handleUpdateLua = async (id: number, values: any) => { await api.put(`/waf/lua/${id}`, values); message.success('LUA script updated'); await fetchLists(); };
  const handleDeleteLua = async (id: number) => { await api.delete(`/waf/lua/${id}`); message.success('LUA script deleted'); await fetchLists(); };
  const handleToggleLua = async (id: number, enabled: boolean) => { await api.put(`/waf/lua/${id}/toggle`, { enabled }); await fetchLists(); };
  const handleAddUA = async (ua: string, type: string, description?: string) => { await api.post('/waf/ua', { ua_pattern: ua, list_type: type, description }); message.success('User-Agent added'); await fetchLists(); };
  const handleRemoveUA = async (id: number) => { await api.delete(`/waf/ua/${id}`); message.success('UA removed'); await fetchLists(); };
  const handleToggleUA = async (id: number, enabled: boolean) => { await api.put(`/waf/ua/${id}/toggle`, { enabled }); await fetchLists(); };

  // Settings
  const handleSaveSettings = async (values: any) => { try { await api.put('/waf/settings', values); message.success('Settings saved'); await fetchSettings(); } catch { message.error('Failed'); } };

  const tabs: { key: WAFTab; icon: React.ReactNode; label: string; requireEnabled?: boolean }[] = [
    { key: 'overview', icon: <WafIcons.Chart size={14} />, label: 'Overview' },
    { key: 'traffic', icon: <WafIcons.Traffic size={14} />, label: 'Traffic', requireEnabled: true },
    { key: 'feed', icon: <WafIcons.Activity size={14} />, label: 'Attack Feed', requireEnabled: true },
    { key: 'sites', icon: <WafIcons.Globe size={14} />, label: 'Sites', requireEnabled: true },
    { key: 'rules', icon: <WafIcons.Rule size={14} />, label: 'Rules', requireEnabled: true },
    { key: 'logs', icon: <WafIcons.Log size={14} />, label: 'Logs', requireEnabled: true },
    { key: 'lists', icon: <WafIcons.List size={14} />, label: 'Lists', requireEnabled: true },
    { key: 'settings', icon: <WafIcons.Gear size={14} />, label: 'Settings', requireEnabled: true },
  ];

  const wafEnabled = status?.installed && status?.running;

  return (
    <div style={{ padding: isMobile ? 12 : 24 }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <WafIcons.Shield size={24} color={p.accent} />
        <div><h2 style={{ margin: 0, fontWeight: 700, color: p.text, fontSize: 18 }}>Web Application Firewall</h2><p style={{ margin: 0, fontSize: 12, color: p.textMuted }}>HAProxy + Coraza WAF · OWASP CRS v4</p></div>
      </div>

      <div style={{ background: isDark ? p.card : '#fff', borderRadius: 12, border: `1px solid ${p.cardBorder}`, overflow: 'hidden' }}>
        <div style={{ padding: '10px 20px', borderBottom: `1px solid ${p.cardBorder}`, background: p.headerBg, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.key;
            const locked = tab.requireEnabled && !wafEnabled;
            return (
              <button key={tab.key} onClick={() => handleTabClick(tab.key)} disabled={locked && !isActive}
                style={{ padding: '7px 14px', borderRadius: 6, border: locked ? `1px dashed ${p.textMuted}40` : isActive ? `1px solid ${p.accent}40` : '1px solid transparent', cursor: locked ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, background: isActive ? `${p.accent}15` : locked ? `${p.textMuted}05` : 'transparent', color: locked ? `${p.textMuted}60` : isActive ? p.accent : p.textMuted, opacity: locked ? 0.6 : 1, transition: 'all 0.15s', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {tab.icon} {tab.label}
                {locked && <LockOutlined style={{ fontSize: 10 }} />}
              </button>
            );
          })}
        </div>

        <div style={{ padding: 20 }}>
          {activeTab === 'overview' && <OverviewTab status={status} stats={stats} trafficStats={trafficStats} geoStats={geoStats} onRefresh={() => { fetchStatus(); fetchStats(); }} onInstall={handleInstall} onRestart={handleRestart} onToggle={handleToggleMode} installing={installing} toggling={toggling} />}
          {activeTab === 'traffic' && <TrafficTab trafficStats={trafficStats} slowRequests={slowRequests} geoStats={geoStats} loading={false} onRefresh={fetchStats} />}
          {activeTab === 'feed' && <AttackFeedTab feed={attackFeed} geoStats={geoStats} loading={false} onRefresh={fetchStats} />}
          {activeTab === 'sites' && <SitesTab sites={sites} loading={sitesLoading} onRefresh={fetchSites} onCreate={handleCreateSite} onUpdate={handleUpdateSite} onDelete={handleDeleteSite} onToggle={handleToggleSite} />}
          {activeTab === 'rules' && <RulesTab rules={rules} categories={categories} loading={rulesLoading} onRefresh={fetchRules} onCreate={handleCreateRule} onUpdate={handleUpdateRule} onDelete={handleDeleteRule} onToggle={handleToggleRule} onToggleOWASP={handleToggleOWASP} />}
          {activeTab === 'logs' && <LogsTab logs={logs} loading={logsLoading} total={logsTotal} onRefresh={fetchLogs} page={logsPage} pageSize={logsPageSize} onPageChange={(p, s) => { setLogsPage(p); setLogsPageSize(s); }} filterAction={filterAction} onFilterAction={setFilterAction} filterCategory={filterCategory} onFilterCategory={setFilterCategory} search={logsSearch} onSearch={setLogsSearch} />}
          {activeTab === 'lists' && <ListsTab ipEntries={ipEntries} uriEntries={uriEntries} luaEntries={luaEntries} uaEntries={uaEntries} loading={listsLoading} onAddIP={handleAddIP} onRemoveIP={handleRemoveIP} onUpdateIP={handleUpdateIP} onClearHits={handleClearHits} onAddURI={handleAddURI} onRemoveURI={handleRemoveURI} onToggleURI={handleToggleURI} onAddLua={handleAddLua} onUpdateLua={handleUpdateLua} onDeleteLua={handleDeleteLua} onToggleLua={handleToggleLua} onAddUA={handleAddUA} onRemoveUA={handleRemoveUA} onToggleUA={handleToggleUA} />}
          {activeTab === 'settings' && <SettingsTab settings={settings} loading={settingsLoading} onSave={handleSaveSettings} />}
        </div>
      </div>
    </div>
  );
}
