import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card, Table, Button, Space, Input, InputNumber, Select, Switch, Modal, Form,
  Tag, Popconfirm, message, Spin, Tabs, Statistic, Row, Col,
  Tooltip, Badge, Progress, Divider, Alert, Empty, Drawer
} from 'antd';
import {
  SafetyOutlined, PlusOutlined, ReloadOutlined, DeleteOutlined,
  EditOutlined, EyeOutlined, SearchOutlined, SettingOutlined,
  PlayCircleOutlined, StopOutlined, ThunderboltOutlined,
  GlobalOutlined, LockOutlined, AlertOutlined, FileTextOutlined,
  NodeIndexOutlined, BlockOutlined, CheckCircleOutlined, CloseCircleOutlined,
  CloudServerOutlined, ImportOutlined, ExportOutlined, CopyOutlined,
  LineChartOutlined, PieChartOutlined, BarChartOutlined,
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
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  ),
  Rule: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  Log: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
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
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  Block: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
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
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
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
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WAFStatus {
  installed: boolean;
  running: boolean;
  haproxy_installed: boolean;
  coraza_installed: boolean;
  version: string;
  mode: string;
  uptime: number;
  total_sites: number;
  active_sites: number;
  total_rules: number;
  active_rules: number;
  blocked_today: number;
  total_requests_today: number;
}

interface WAFSite {
  id: number;
  name: string;
  domain: string;
  backend_url: string;
  listen_port: number;
  ssl_port: number;
  enabled: boolean;
  mode: string;
  ssl_enabled: boolean;
  ssl_cert_path?: string;
  ssl_key_path?: string;
  health_check_path?: string;
  max_connections: number;
  timeout_client: number;
  timeout_server: number;
  description?: string;
  rules_count: number;
  created_at: string;
  updated_at: string;
}

interface WAFRule {
  id: number;
  name: string;
  rule_type: string;
  category: string;
  phase: number;
  action: string;
  rule_content: string;
  enabled: boolean;
  priority: number;
  log_level: string;
  description?: string;
  rule_group?: string;
  owasp_rule_id?: string;
  created_at: string;
  updated_at: string;
}

interface WAFOWASPCategory {
  id: number;
  category_id: string;
  name: string;
  description?: string;
  enabled: boolean;
  severity: string;
  mitre_technique: string;
}

interface WAFSettings {
  global_mode: string;
  owasp_rules_enabled: boolean;
  owasp_ruleset_version: string;
  paranoia_level: number;
  anomaly_threshold: number;
  log_requests: string;
  log_retention_days: number;
  log_request_body: boolean;
  geo_blocking_enabled: boolean;
  geo_blocked_countries: string[];
  whitelisted_ips: string[];
  blacklisted_ips: string[];
  service_status: string;
}

interface WAFLogEntry {
  id: number;
  timestamp: string;
  site_id?: number;
  site_name?: string;
  client_ip: string;
  method: string;
  uri: string;
  host: string;
  rule_id?: string;
  rule_message?: string;
  rule_severity?: string;
  rule_category?: string;
  action_taken: string;
  anomaly_score?: number;
  geo_country?: string;
  user_agent?: string;
  referer?: string;
  response_code?: number;
  request_body?: string;
  request_headers?: string;
  matched_data?: string;
}

interface WAFStats {
  total_requests: number;
  blocked_requests: number;
  allowed_requests: number;
  sqli_count: number;
  xss_count: number;
  lfi_count: number;
  rce_count: number;
  other_count: number;
  block_rate: number;
  top_blocked_ips: { ip: string; count: number }[];
  top_triggered_rules: { rule_id: string; name: string; category: string; count: number }[];
  avg_anomaly_score: number;
  requests_by_hour: { hour: string; allowed: number; blocked: number }[];
}

interface WAFIPEntry {
  id: number;
  ip_address: string;
  list_type: string;
  description?: string;
  expires_at?: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Styles Hook
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

  const btnPrimary: React.CSSProperties = {
    padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
    background: p.accent, color: '#fff', fontSize: 12, fontWeight: 500,
    display: 'inline-flex', alignItems: 'center', gap: 6,
  };

  const btnOutline: React.CSSProperties = {
    padding: '6px 16px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
    background: 'transparent', color: p.text, fontSize: 12, fontWeight: 500, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  };

  const btnDanger: React.CSSProperties = {
    padding: '6px 16px', borderRadius: 6, border: `1px solid ${p.red}`,
    background: 'transparent', color: p.red, fontSize: 12, fontWeight: 500,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
  };

  const btnSuccess: React.CSSProperties = {
    ...btnPrimary, background: p.green,
  };

  return { sectionBox, btnPrimary, btnOutline, btnDanger, btnSuccess, p, isDark, isMobile };
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
    case 'SQLI': return '#FF6B6B';
    case 'XSS': return p.amber;
    case 'LFI': return '#9B59B6';
    case 'RCE': return p.red;
    case 'CRLF': return p.accent;
    case 'TRAVERSAL': return '#E67E22';
    default: return p.textMuted;
  }
}

// ---------------------------------------------------------------------------
// Tab 1: Overview Dashboard
// ---------------------------------------------------------------------------

function OverviewTab({ status, stats, onRefresh, onInstall, onRestart, onToggle }: {
  status: WAFStatus | null;
  stats: WAFStats | null;
  onRefresh: () => void;
  onInstall: () => void;
  onRestart: () => void;
  onToggle: (enabled: boolean) => void;
  installing: boolean;
  toggling: boolean;
}) {
  const { t } = useTranslation();
  const { sectionBox, btnPrimary, btnOutline, p, isDark } = useStyles();

  if (!status) {
    return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>;
  }

  if (!status.installed) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center', padding: '40px 20px' }}>
        <div style={{
          width: 80, height: 80, borderRadius: 20, margin: '0 auto 24px',
          background: `${p.accent}10`, border: `2px solid ${p.accent}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <WafIcons.Shield size={40} color={p.accent} />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: p.text, margin: '0 0 8px' }}>
          Web Application Firewall
        </h2>
        <p style={{ fontSize: 13, color: p.textMuted, marginBottom: 24, lineHeight: 1.7, maxWidth: 440, margin: '0 auto 24px' }}>
          Protect your web applications with HAProxy + Coraza WAF. Uses OWASP Core Rule Set v4 to detect
          and block SQL injection, XSS, LFI, RCE, and other web attacks in real-time.
        </p>
        <div style={{
          padding: '16px 20px', borderRadius: 10, marginBottom: 24, textAlign: 'left',
          background: `${p.accent}08`, border: `1px solid ${p.accent}20`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: p.text, marginBottom: 8 }}>
            What you get:
          </div>
          {[
            'OWASP CRS v4 rule set (SQLi, XSS, LFI, RCE...)',
            'Real-time request/response inspection',
            'Custom rule builder with SecLang',
            'IP whitelist & blacklist management',
            'Comprehensive audit logging',
            'Geo-blocking support',
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <WafIcons.Check size={14} color={p.green} />
              <span style={{ fontSize: 12, color: p.textMuted }}>{item}</span>
            </div>
          ))}
        </div>
        <Button type="primary" size="large" icon={<SafetyOutlined />} onClick={onInstall}
          loading={false} style={{ height: 44, borderRadius: 8 }}>
          Enable WAF
        </Button>
      </div>
    );
  }

  const blockRate = stats?.block_rate ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Status Header */}
      <div style={sectionBox}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: status.running ? `${p.green}15` : `${p.red}15`,
              border: `2px solid ${status.running ? p.green : p.red}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <WafIcons.Shield size={28} color={status.running ? p.green : p.red} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: p.text }}>
                {status.running ? 'WAF Active' : 'WAF Stopped'}
              </div>
              <div style={{ fontSize: 12, color: p.textMuted }}>
                Coraza SPOA v{status.version || '0.6.1'} · HAProxy + Coraza WAF · Uptime: {formatUptime(status.uptime)}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button icon={<ReloadOutlined />} onClick={onRefresh}>Refresh</Button>
            <Button icon={<PlayCircleOutlined />} onClick={onRestart}>Restart</Button>
            <Popconfirm
              title={status.mode === 'blocking' ? 'Switch to Detection Mode?' : 'Switch to Blocking Mode?'}
              description={status.mode === 'blocking'
                ? 'WAF will log attacks but allow requests through.'
                : 'WAF will actively block malicious requests.'}
              onConfirm={() => onToggle(status.mode !== 'blocking')}
            >
              <Tag color={status.mode === 'blocking' ? 'green' : 'orange'} style={{ fontSize: 13, padding: '4px 12px', cursor: 'pointer' }}>
                {status.mode === 'blocking' ? '🛡 Blocking' : '🔍 Detection'}
              </Tag>
            </Popconfirm>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <Row gutter={[16, 16]}>
        {[
          { label: 'Total Requests (24h)', value: stats?.total_requests ?? 0, color: p.accent, icon: <NodeIndexOutlined /> },
          { label: 'Blocked', value: stats?.blocked_requests ?? 0, color: p.red, icon: <BlockOutlined /> },
          { label: 'Allowed', value: stats?.allowed_requests ?? 0, color: p.green, icon: <CheckCircleOutlined /> },
          { label: 'Block Rate', value: `${blockRate.toFixed(1)}%`, color: blockRate > 10 ? p.red : p.green, icon: <ThunderboltOutlined /> },
          { label: 'Active Sites', value: status.active_sites, color: p.accent, icon: <CloudServerOutlined /> },
          { label: 'Active Rules', value: status.active_rules, color: p.purple, icon: <WafIcons.Rule size={16} /> },
        ].map((stat, i) => (
          <Col xs={12} sm={8} lg={4} key={i}>
            <div style={{
              ...sectionBox, padding: 16,
              background: `${stat.color}08`, border: `1px solid ${stat.color}20`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: p.textMuted, fontWeight: 500 }}>{stat.label}</span>
                <span style={{ color: stat.color, opacity: 0.8 }}>{stat.icon}</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: stat.color }}>
                {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
              </div>
            </div>
          </Col>
        ))}
      </Row>

      {/* Attack Categories */}
      <div style={sectionBox}>
        <SectionTitle icon={<AlertOutlined style={{ color: p.accent }} />} title="Attack Detection (24h)" />
        <Row gutter={[12, 12]}>
          {[
            { label: 'SQL Injection', count: stats?.sqli_count ?? 0, color: '#FF6B6B' },
            { label: 'Cross-Site Scripting', count: stats?.xss_count ?? 0, color: p.amber },
            { label: 'Local File Inclusion', count: stats?.lfi_count ?? 0, color: '#9B59B6' },
            { label: 'Remote Code Execution', count: stats?.rce_count ?? 0, color: p.red },
            { label: 'Other Attacks', count: stats?.other_count ?? 0, color: p.textMuted },
          ].map((cat, i) => (
            <Col xs={12} sm={8} lg={5} key={i}>
              <div style={{
                padding: '14px 16px', borderRadius: 10,
                background: `${cat.color}08`, border: `1px solid ${cat.color}20`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 11, color: p.textMuted }}>{cat.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: cat.color }}>
                    {(cat.count as number).toLocaleString()}
                  </div>
                </div>
                <Progress type="circle" percent={stats?.total_requests ? Math.min(100, (cat.count as number / stats.total_requests) * 100) : 0}
                  size={44} strokeColor={cat.color} trailColor={`${cat.color}20`} format={() => ''} />
              </div>
            </Col>
          ))}
        </Row>
      </div>

      {/* Top Blocked IPs & Top Rules */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <div style={sectionBox}>
            <SectionTitle icon={<WafIcons.Ip size={16} color={p.accent} />} title="Top Blocked IPs" />
            {stats?.top_blocked_ips && stats.top_blocked_ips.length > 0 ? (
              <div>
                {stats.top_blocked_ips.slice(0, 5).map((ip, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 0', borderBottom: `1px solid ${p.cardBorder}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <code style={{ fontSize: 13, fontWeight: 600, color: p.accent }}>{ip.ip}</code>
                    </div>
                    <Tag color="red" style={{ margin: 0 }}>{ip.count.toLocaleString()} blocked</Tag>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 20, color: p.textMuted }}>
                No blocked IPs in the last 24 hours
              </div>
            )}
          </div>
        </Col>
        <Col xs={24} lg={12}>
          <div style={sectionBox}>
            <SectionTitle icon={<WafIcons.Rule size={16} color={p.accent} />} title="Top Triggered Rules" />
            {stats?.top_triggered_rules && stats.top_triggered_rules.length > 0 ? (
              <div>
                {stats.top_triggered_rules.slice(0, 5).map((rule, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 0', borderBottom: `1px solid ${p.cardBorder}`,
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: p.text }}>{rule.name}</div>
                      {rule.rule_id && <code style={{ fontSize: 11, color: p.textMuted }}>{rule.rule_id}</code>}
                    </div>
                    <Tag color="orange" style={{ margin: 0 }}>{rule.count.toLocaleString()}</Tag>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 20, color: p.textMuted }}>
                No rules triggered in the last 24 hours
              </div>
            )}
          </div>
        </Col>
      </Row>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: Sites Management
// ---------------------------------------------------------------------------

function SitesTab({ sites, loading, onRefresh, onCreate, onUpdate, onDelete, onToggle }: {
  sites: WAFSite[];
  loading: boolean;
  onRefresh: () => void;
  onCreate: (values: any) => Promise<void>;
  onUpdate: (id: number, values: any) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onToggle: (id: number, enabled: boolean) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { sectionBox, btnPrimary, btnOutline, btnDanger, p, isDark, isMobile } = useStyles();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WAFSite | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ listen_port: 80, ssl_port: 443, max_connections: 2000, timeout_client: 30000, timeout_server: 30000, enabled: true, mode: 'blocking', ssl_enabled: false });
    setModalOpen(true);
  };

  const openEdit = (site: WAFSite) => {
    setEditing(site);
    form.setFieldsValue({
      name: site.name, domain: site.domain, backend_url: site.backend_url,
      listen_port: site.listen_port, ssl_port: site.ssl_port, enabled: site.enabled,
      mode: site.mode, ssl_enabled: site.ssl_enabled, ssl_cert_path: site.ssl_cert_path,
      ssl_key_path: site.ssl_key_path, health_check_path: site.health_check_path,
      max_connections: site.max_connections, timeout_client: site.timeout_client,
      timeout_server: site.timeout_server, description: site.description,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editing) {
        await onUpdate(editing.id, values);
      } else {
        await onCreate(values);
      }
      setModalOpen(false);
    } catch {} finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: 'Domain',
      dataIndex: 'domain',
      key: 'domain',
      render: (v: string, r: WAFSite) => (
        <div>
          <div style={{ fontWeight: 600, color: p.text }}>{v}</div>
          <div style={{ fontSize: 11, color: p.textMuted }}>{r.name}</div>
        </div>
      ),
    },
    {
      title: 'Backend',
      dataIndex: 'backend_url',
      key: 'backend_url',
      render: (v: string) => <code style={{ fontSize: 11, color: p.accent }}>{v}</code>,
    },
    {
      title: 'Port',
      dataIndex: 'listen_port',
      key: 'listen_port',
      width: 80,
      render: (v: number, r: WAFSite) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Tag style={{ margin: 0, fontSize: 11 }}>{v}</Tag>
          {r.ssl_enabled && <Tag color="green" style={{ margin: 0, fontSize: 11 }}>{r.ssl_port}</Tag>}
        </div>
      ),
    },
    {
      title: 'Mode',
      dataIndex: 'mode',
      key: 'mode',
      width: 100,
      render: (v: string) => (
        <Tag color={v === 'blocking' ? 'green' : 'orange'} style={{ margin: 0 }}>
          {v === 'blocking' ? 'Blocking' : 'Detection'}
        </Tag>
      ),
    },
    {
      title: 'Rules',
      dataIndex: 'rules_count',
      key: 'rules_count',
      width: 70,
      render: (v: number) => <span style={{ fontWeight: 600, color: p.accent }}>{v}</span>,
    },
    {
      title: 'Status',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 90,
      render: (v: boolean) => (
        <Switch checked={v} size="small" />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_: any, r: WAFSite) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Delete this site?" onConfirm={() => onDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ ...sectionBox, padding: '16px 24px', marginBottom: 0, borderBottom: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <SectionTitle icon={<WafIcons.Globe size={18} color={p.accent} />} title="Protected Sites" />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<ReloadOutlined />} onClick={onRefresh}>Refresh</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add Site</Button>
          </div>
        </div>
      </div>
      <Card style={{ borderRadius: '0 0 12px 12px', borderTop: 'none' }} styles={{ body: { padding: 0 } }}>
        <Table dataSource={sites} columns={columns} rowKey="id" loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          scroll={isMobile ? { x: 600 } : undefined} />
      </Card>

      <Modal
        title={editing ? `Edit Site: ${editing.domain}` : 'Add Protected Site'}
        open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleSave}
        okText={editing ? 'Update' : 'Create'} confirmLoading={saving} width={600}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="name" label="Site Name" rules={[{ required: true }]}>
              <Input placeholder="e.g. Production API" />
            </Form.Item>
            <Form.Item name="domain" label="Domain" rules={[{ required: true }]}
              extra={<span style={{ fontSize: 11, color: p.textMuted }}>The domain to protect</span>}>
              <Input placeholder="e.g. api.example.com" />
            </Form.Item>
          </div>
          <Form.Item name="backend_url" label="Backend URL" rules={[{ required: true }]}
            extra={<span style={{ fontSize: 11, color: p.textMuted }}>Where to forward clean requests</span>}>
            <Input placeholder="http://127.0.0.1:8080" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="listen_port" label="HTTP Port" rules={[{ required: true }]}>
              <InputNumber min={1} max={65535} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="ssl_port" label="HTTPS Port">
              <InputNumber min={1} max={65535} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="max_connections" label="Max Connections">
              <InputNumber min={100} max={50000} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="mode" label="WAF Mode">
              <Select options={[
                { value: 'blocking', label: '🛡 Blocking' },
                { value: 'detection', label: '🔍 Detection (Learning)' },
              ]} />
            </Form.Item>
            <Form.Item name="ssl_enabled" label="SSL Termination" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>
          <Form.Item name="health_check_path" label="Health Check Path" extra={<span style={{ fontSize: 11, color: p.textMuted }}>Path for HAProxy health check</span>}>
            <Input placeholder="/health" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Optional description..." />
          </Form.Item>
          <Form.Item name="enabled" label="Enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3: Rules Management
// ---------------------------------------------------------------------------

function RulesTab({ rules, categories, loading, onRefresh, onCreate, onUpdate, onDelete, onToggle, onToggleOWASP }: {
  rules: WAFRule[];
  categories: WAFOWASPCategory[];
  loading: boolean;
  onRefresh: () => void;
  onCreate: (values: any) => Promise<void>;
  onUpdate: (id: number, values: any) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onToggle: (id: number, enabled: boolean) => Promise<void>;
  onToggleOWASP: (categoryId: string, enabled: boolean) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { sectionBox, btnPrimary, btnOutline, btnDanger, p, isDark, isMobile } = useStyles();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WAFRule | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return rules.filter(r => {
      if (filterType && r.rule_type !== filterType) return false;
      if (filterCategory && r.category !== filterCategory) return false;
      if (search && !r.name.toLowerCase().includes(search.toLowerCase()) && !r.rule_content.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rules, filterType, filterCategory, search]);

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ phase: 1, action: 'block', priority: 100, log_level: 'alert', rule_type: 'custom', category: 'custom', enabled: true });
    setModalOpen(true);
  };

  const openEdit = (rule: WAFRule) => {
    setEditing(rule);
    form.setFieldsValue(rule);
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editing) {
        await onUpdate(editing.id, values);
      } else {
        await onCreate(values);
      }
      setModalOpen(false);
    } catch {} finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: 'Rule Name',
      dataIndex: 'name',
      key: 'name',
      render: (v: string, r: WAFRule) => (
        <div>
          <div style={{ fontWeight: 600, color: p.text }}>{v}</div>
          {r.rule_group && <Tag style={{ fontSize: 10, margin: '2px 0 0', borderRadius: 3 }}>{r.rule_group}</Tag>}
        </div>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'rule_type',
      key: 'rule_type',
      width: 90,
      render: (v: string) => (
        <Tag color={v === 'owasp' ? 'blue' : v === 'ip_match' ? 'purple' : 'default'} style={{ margin: 0 }}>
          {v.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (v: string) => (
        <Tag style={{ margin: 0, background: `${categoryColor(v, p)}15`, color: categoryColor(v, p), border: `1px solid ${categoryColor(v, p)}30` }}>
          {v}
        </Tag>
      ),
    },
    {
      title: 'Phase',
      dataIndex: 'phase',
      key: 'phase',
      width: 60,
      render: (v: number) => <Tag style={{ margin: 0 }}>{v}</Tag>,
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      width: 80,
      render: (v: string) => (
        <Tag color={v === 'block' ? 'red' : v === 'allow' ? 'green' : 'default'} style={{ margin: 0 }}>
          {v}
        </Tag>
      ),
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      width: 70,
      render: (v: number) => <span style={{ fontSize: 12, color: p.textMuted }}>{v}</span>,
    },
    {
      title: 'Status',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (v: boolean) => <Switch checked={v} size="small" />,
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_: any, r: WAFRule) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Delete this rule?" onConfirm={() => onDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* OWASP Categories */}
      <div style={sectionBox}>
        <SectionTitle icon={<WafIcons.Alert size={18} color={p.accent} />} title="OWASP CRS Categories" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {categories.map(cat => (
            <div key={cat.category_id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderRadius: 8,
              background: cat.enabled ? `${p.green}08` : isDark ? p.card : '#F5F5F5',
              border: `1px solid ${cat.enabled ? p.green + '20' : p.cardBorder}`,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: p.text }}>{cat.name}</div>
                <div style={{ fontSize: 11, color: p.textMuted }}>{cat.severity} · {cat.category_id}</div>
              </div>
              <Switch checked={cat.enabled} size="small" onChange={(v) => onToggleOWASP(cat.category_id, v)} />
            </div>
          ))}
        </div>
      </div>

      {/* Custom Rules */}
      <div style={sectionBox}>
        <SectionTitle icon={<WafIcons.Rule size={18} color={p.accent} />} title="Custom Rules"
          extra={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Input placeholder="Search rules..." prefix={<SearchOutlined />} value={search}
                onChange={e => setSearch(e.target.value)} allowClear style={{ width: 180, fontSize: 12 }} />
              <Select placeholder="Type" value={filterType || undefined} onChange={v => setFilterType(v || '')}
                allowClear style={{ width: 100 }} options={[
                  { value: 'custom', label: 'Custom' },
                  { value: 'owasp', label: 'OWASP' },
                  { value: 'ip_match', label: 'IP Match' },
                ]} />
              <Select placeholder="Category" value={filterCategory || undefined} onChange={v => setFilterCategory(v || '')}
                allowClear style={{ width: 120 }} options={[
                  { value: 'SQLi', label: 'SQLi' }, { value: 'XSS', label: 'XSS' },
                  { value: 'LFI', label: 'LFI' }, { value: 'RCE', label: 'RCE' },
                  { value: 'CRLF', label: 'CRLF' }, { value: 'TRAVERSAL', label: 'Traversal' },
                  { value: 'custom', label: 'Custom' },
                ]} />
              <Button icon={<ReloadOutlined />} onClick={onRefresh}>Refresh</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add Rule</Button>
            </div>
          }
        />
        <Table dataSource={filtered} columns={columns} rowKey="id" loading={loading}
          pagination={{ pageSize: 10 }} scroll={isMobile ? { x: 700 } : undefined}
          locale={{ emptyText: <Empty description="No custom rules yet" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }} />
      </div>

      <Modal
        title={editing ? `Edit Rule: ${editing.name}` : 'Create Custom Rule'}
        open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleSave}
        okText={editing ? 'Update' : 'Create'} confirmLoading={saving} width={700}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="name" label="Rule Name" rules={[{ required: true }]}>
              <Input placeholder="e.g. Block SQL Keywords" />
            </Form.Item>
            <Form.Item name="category" label="Category" rules={[{ required: true }]}>
              <Select options={[
                { value: 'SQLi', label: 'SQL Injection' }, { value: 'XSS', label: 'Cross-Site Scripting' },
                { value: 'LFI', label: 'Local File Inclusion' }, { value: 'RCE', label: 'Remote Code Execution' },
                { value: 'CRLF', label: 'CRLF Injection' }, { value: 'TRAVERSAL', label: 'Path Traversal' },
                { value: 'custom', label: 'Custom' },
              ]} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="phase" label="Phase">
              <Select options={[
                { value: 1, label: '1 - Request Headers' },
                { value: 2, label: '2 - Request Body' },
                { value: 3, label: '3 - Response Headers' },
                { value: 4, label: '4 - Response Body' },
              ]} />
            </Form.Item>
            <Form.Item name="action" label="Action" rules={[{ required: true }]}>
              <Select options={[
                { value: 'block', label: 'Block' }, { value: 'allow', label: 'Allow' }, { value: 'log', label: 'Log Only' },
              ]} />
            </Form.Item>
            <Form.Item name="priority" label="Priority">
              <InputNumber min={1} max={999} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="rule_content" label="Rule (SecLang)" rules={[{ required: true }]}
            extra={<span style={{ fontSize: 11, color: p.textMuted }}>SecLang rule expression (e.g. ARGS|REQUEST_HEADERS|... @rx pattern)</span>}>
            <Input.TextArea rows={3} placeholder="ARGS @rx (?i)(union.*select|drop.*table)" style={{ fontFamily: 'monospace', fontSize: 12 }} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="log_level" label="Log Level">
              <Select options={[
                { value: 'alert', label: 'Alert' }, { value: 'critical', label: 'Critical' },
                { value: 'error', label: 'Error' }, { value: 'warning', label: 'Warning' },
                { value: 'notice', label: 'Notice' },
              ]} />
            </Form.Item>
            <Form.Item name="rule_group" label="Rule Group">
              <Input placeholder="e.g. SQL Injection Detection" />
            </Form.Item>
          </div>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Describe what this rule does..." />
          </Form.Item>
          <Form.Item name="enabled" label="Enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 4: Logs
// ---------------------------------------------------------------------------

function LogsTab({ logs, loading, total, onRefresh, page, pageSize, onPageChange, filterAction, onFilterAction, filterCategory, onFilterCategory, search, onSearch }: {
  logs: WAFLogEntry[];
  loading: boolean;
  total: number;
  onRefresh: () => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number, pageSize: number) => void;
  filterAction: string;
  onFilterAction: (v: string) => void;
  filterCategory: string;
  onFilterCategory: (v: string) => void;
  search: string;
  onSearch: (v: string) => void;
}) {
  const { t } = useTranslation();
  const { sectionBox, btnOutline, p, isDark, isMobile } = useStyles();
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const columns = [
    {
      title: 'Time',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 150,
      render: (v: string) => (
        <span style={{ fontSize: 11, color: p.textMuted, fontFamily: 'monospace' }}>
          {new Date(v).toLocaleString()}
        </span>
      ),
    },
    {
      title: 'IP',
      dataIndex: 'client_ip',
      key: 'client_ip',
      width: 120,
      render: (v: string, r: WAFLogEntry) => (
        <div>
          <code style={{ fontSize: 12, color: p.accent, fontWeight: 600 }}>{v}</code>
          {r.geo_country && <div style={{ fontSize: 10, color: p.textMuted }}>{r.geo_country}</div>}
        </div>
      ),
    },
    {
      title: 'Method',
      dataIndex: 'method',
      key: 'method',
      width: 70,
      render: (v: string) => {
        const colors: Record<string, string> = { GET: 'blue', POST: 'green', PUT: 'orange', DELETE: 'red', PATCH: 'purple' };
        return <Tag color={colors[v] || 'default'} style={{ margin: 0, fontSize: 11 }}>{v}</Tag>;
      },
    },
    {
      title: 'URI',
      dataIndex: 'uri',
      key: 'uri',
      ellipsis: true,
      render: (v: string) => <code style={{ fontSize: 11, color: p.text }}>{v.length > 50 ? v.substring(0, 50) + '...' : v}</code>,
    },
    {
      title: 'Category',
      dataIndex: 'rule_category',
      key: 'rule_category',
      width: 90,
      render: (v: string) => v ? (
        <Tag style={{ margin: 0, fontSize: 10, background: `${categoryColor(v, p)}15`, color: categoryColor(v, p), border: `1px solid ${categoryColor(v, p)}30` }}>
          {v}
        </Tag>
      ) : <span style={{ color: p.textMuted, fontSize: 11 }}>-</span>,
    },
    {
      title: 'Severity',
      dataIndex: 'rule_severity',
      key: 'rule_severity',
      width: 80,
      render: (v: string) => v ? (
        <Tag style={{ margin: 0, fontSize: 10, background: `${severityColor(v, p)}15`, color: severityColor(v, p), border: `1px solid ${severityColor(v, p)}30` }}>
          {v}
        </Tag>
      ) : <span style={{ color: p.textMuted, fontSize: 11 }}>-</span>,
    },
    {
      title: 'Action',
      dataIndex: 'action_taken',
      key: 'action_taken',
      width: 90,
      render: (v: string) => (
        <Tag color={v === 'blocked' ? 'red' : v === 'allowed' ? 'green' : 'default'} style={{ margin: 0 }}>
          {v === 'blocked' ? '🚫 Blocked' : v === 'allowed' ? '✓ Allowed' : v}
        </Tag>
      ),
    },
    {
      title: '',
      key: 'expand',
      width: 40,
      render: (_: any, r: WAFLogEntry) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => setExpandedRow(expandedRow === r.id ? null : r.id)} />
      ),
    },
  ];

  return (
    <div>
      <div style={sectionBox}>
        <SectionTitle icon={<WafIcons.Log size={18} color={p.accent} />} title="WAF Audit Logs"
          extra={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Select value={filterAction || undefined} onChange={v => onFilterAction(v || '')}
                allowClear placeholder="Action" style={{ width: 110 }} options={[
                  { value: 'blocked', label: 'Blocked' }, { value: 'allowed', label: 'Allowed' },
                ]} />
              <Select value={filterCategory || undefined} onChange={v => onFilterCategory(v || '')}
                allowClear placeholder="Category" style={{ width: 110 }} options={[
                  { value: 'SQLi', label: 'SQLi' }, { value: 'XSS', label: 'XSS' },
                  { value: 'LFI', label: 'LFI' }, { value: 'RCE', label: 'RCE' },
                ]} />
              <Input placeholder="Search IP/URI..." prefix={<SearchOutlined />} value={search}
                onChange={e => onSearch(e.target.value)} allowClear style={{ width: 180, fontSize: 12 }} />
              <Button icon={<ReloadOutlined />} onClick={onRefresh}>Refresh</Button>
            </div>
          }
        />
        <Table
          dataSource={logs}
          columns={columns}
          rowKey="id"
          loading={loading}
          expandable={{
            expandedRowKeys: expandedRow ? [expandedRow] : [],
            expandedRowRender: (record: WAFLogEntry) => (
              <div style={{ padding: '12px 16px', background: isDark ? p.card : '#F5F7FA', borderRadius: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Rule ID</div>
                    <code style={{ fontSize: 11, color: p.accent }}>{record.rule_id || 'N/A'}</code>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Rule Message</div>
                    <span style={{ fontSize: 12, color: p.text }}>{record.rule_message || 'N/A'}</span>
                  </div>
                  {record.user_agent && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>User Agent</div>
                      <code style={{ fontSize: 11, color: p.text }}>{record.user_agent}</code>
                    </div>
                  )}
                  {record.referer && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Referer</div>
                      <code style={{ fontSize: 11, color: p.text }}>{record.referer}</code>
                    </div>
                  )}
                  {record.matched_data && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Matched Data</div>
                      <code style={{ fontSize: 11, color: p.red, background: `${p.red}10`, padding: '2px 6px', borderRadius: 4 }}>{record.matched_data}</code>
                    </div>
                  )}
                </div>
              </div>
            ),
          }}
          pagination={{
            current: page, pageSize, total, showSizeChanger: true,
            showTotal: (total) => `${total} entries`,
            onChange: onPageChange,
          }}
          scroll={isMobile ? { x: 800 } : undefined}
          size="small"
          locale={{ emptyText: <Empty description="No log entries found" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 5: Settings
// ---------------------------------------------------------------------------

function SettingsTab({ settings, loading, onSave, onAddIP, onRemoveIP }: {
  settings: WAFSettings | null;
  loading: boolean;
  onSave: (values: any) => Promise<void>;
  onAddIP: (ip: string, type: string, description?: string) => Promise<void>;
  onRemoveIP: (id: number) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { sectionBox, btnPrimary, btnOutline, btnDanger, p, isDark } = useStyles();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [ipModalOpen, setIPModalOpen] = useState(false);
  const [ipType, setIPType] = useState('whitelist');
  const [newIP, setNewIP] = useState('');
  const [ipDesc, setIPDesc] = useState('');
  const [ipAdding, setIPAdding] = useState(false);

  useEffect(() => {
    if (settings) {
      form.setFieldsValue({
        global_mode: settings.global_mode,
        owasp_rules_enabled: settings.owasp_rules_enabled,
        paranoia_level: settings.paranoia_level,
        anomaly_threshold: settings.anomaly_threshold,
        log_requests: settings.log_requests,
        log_retention_days: settings.log_retention_days,
        log_request_body: settings.log_request_body,
        geo_blocking_enabled: settings.geo_blocking_enabled,
      });
    }
  }, [settings, form]);

  const handleSave = async (values: any) => {
    setSaving(true);
    try {
      await onSave(values);
    } finally {
      setSaving(false);
    }
  };

  const handleAddIP = async () => {
    if (!newIP.trim()) return;
    setIPAdding(true);
    try {
      await onAddIP(newIP.trim(), ipType, ipDesc);
      setNewIP('');
      setIPDesc('');
      setIPModalOpen(false);
    } finally {
      setIPAdding(false);
    }
  };

  const countryOptions = [
    { value: 'CN', label: '🇨🇳 China' }, { value: 'RU', label: '🇷🇺 Russia' },
    { value: 'KR', label: '🇰🇷 North Korea' }, { value: 'IR', label: '🇮🇷 Iran' },
    { value: 'BY', label: '🇧🇾 Belarus' }, { value: 'NG', label: '🇳🇬 Nigeria' },
    { value: 'IN', label: '🇮🇳 India' }, { value: 'PK', label: '🇵🇰 Pakistan' },
    { value: 'VN', label: '🇻🇳 Vietnam' }, { value: 'US', label: '🇺🇸 United States' },
    { value: 'DE', label: '🇩🇪 Germany' }, { value: 'GB', label: '🇬🇧 United Kingdom' },
    { value: 'JP', label: '🇯🇵 Japan' }, { value: 'SG', label: '🇸🇬 Singapore' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* WAF Mode */}
      <div style={sectionBox}>
        <SectionTitle icon={<WafIcons.Shield size={18} color={p.accent} />} title="WAF Mode" />
        <Form form={form} layout="vertical" onValuesChange={(_, v) => handleSave(v)}>
          <Form.Item name="global_mode" label="Protection Mode">
            <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${p.cardBorder}` }}>
              {['blocking', 'detection'].map(mode => (
                <button key={mode} type="button"
                  onClick={() => form.setFieldValue('global_mode', mode)}
                  style={{
                    padding: '8px 24px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                    background: form.getFieldValue('global_mode') === mode ? p.accent : 'transparent',
                    color: form.getFieldValue('global_mode') === mode ? '#fff' : p.textMuted,
                    borderRight: mode === 'blocking' ? `1px solid ${p.cardBorder}` : 'none',
                  }}>
                  {mode === 'blocking' ? '🛡 Blocking' : '🔍 Detection'}
                </button>
              ))}
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* OWASP Settings */}
      <div style={sectionBox}>
        <SectionTitle icon={<WafIcons.Alert size={18} color={p.accent} />} title="OWASP Core Rule Set" />
        <Form form={form} layout="vertical" onValuesChange={(_, v) => handleSave(v)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="owasp_rules_enabled" label="Enable OWASP Rules" valuePropName="checked">
              <Switch />
            </Form.Item>
            <div>
              <div style={{ fontSize: 12, color: p.textMuted, marginBottom: 4 }}>Ruleset Version</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: p.text }}>{settings?.owasp_ruleset_version || '4.0.0'}</div>
            </div>
          </div>
          <Form.Item name="paranoia_level" label={
            <span>Paranoia Level <span style={{ fontSize: 11, color: p.textMuted, fontWeight: 400 }}>(higher = stricter rules)</span></span>
          }>
            <Select
              value={settings?.paranoia_level || 1}
              onChange={v => { form.setFieldValue('paranoia_level', v); handleSave({ ...settings, paranoia_level: v }); }}
              options={[
                { value: 1, label: 'Level 1 (Default)' }, { value: 2, label: 'Level 2' },
                { value: 3, label: 'Level 3' }, { value: 4, label: 'Level 4 (Paranoid)' },
              ]}
            />
          </Form.Item>
          <Form.Item name="anomaly_threshold" label="Anomaly Threshold">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <InputNumber min={1} max={10} value={settings?.anomaly_threshold || 5}
                onChange={v => { form.setFieldValue('anomaly_threshold', v); handleSave({ ...settings, anomaly_threshold: v }); }}
                style={{ width: 100 }} />
              <span style={{ fontSize: 12, color: p.textMuted }}>Lower = more sensitive</span>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* Logging */}
      <div style={sectionBox}>
        <SectionTitle icon={<WafIcons.Log size={18} color={p.accent} />} title="Logging Settings" />
        <Form form={form} layout="vertical" onValuesChange={(_, v) => handleSave(v)}>
          <Form.Item name="log_requests" label="Log Mode">
            <Select
              value={settings?.log_requests || 'blocked'}
              onChange={v => handleSave({ ...settings, log_requests: v })}
              options={[
                { value: 'all', label: 'Log All Requests' },
                { value: 'blocked', label: 'Log Blocked Requests Only' },
                { value: 'none', label: 'No Logging' },
              ]}
            />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="log_retention_days" label="Log Retention (days)">
              <InputNumber min={1} max={365} value={settings?.log_retention_days || 30}
                onChange={v => handleSave({ ...settings, log_retention_days: v })} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="log_request_body" label="Log Request Bodies">
              <Switch checked={settings?.log_request_body} onChange={v => handleSave({ ...settings, log_request_body: v })} />
            </Form.Item>
          </div>
        </Form>
      </div>

      {/* IP Lists */}
      <div style={sectionBox}>
        <SectionTitle icon={<WafIcons.Ip size={18} color={p.accent} />} title="IP Whitelist & Blacklist"
          extra={
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="small" icon={<PlusOutlined />} onClick={() => { setIPType('whitelist'); setIPModalOpen(true); }}>Whitelist IP</Button>
              <Button size="small" danger icon={<PlusOutlined />} onClick={() => { setIPType('blacklist'); setIPModalOpen(true); }}>Blacklist IP</Button>
            </div>
          }
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: p.green, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <WafIcons.Check size={14} color={p.green} /> Whitelist
            </div>
            {(!settings?.whitelisted_ips || settings.whitelisted_ips.length === 0) ? (
              <div style={{ fontSize: 12, color: p.textMuted, padding: 12 }}>No whitelisted IPs</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {settings.whitelisted_ips.map((ip, i) => (
                  <Tag key={i} closable color="green" onClose={() => onRemoveIP(i)} style={{ margin: 0 }}>{ip}</Tag>
                ))}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: p.red, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <WafIcons.Block size={14} color={p.red} /> Blacklist
            </div>
            {(!settings?.blacklisted_ips || settings.blacklisted_ips.length === 0) ? (
              <div style={{ fontSize: 12, color: p.textMuted, padding: 12 }}>No blacklisted IPs</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {settings.blacklisted_ips.map((ip, i) => (
                  <Tag key={i} closable color="red" onClose={() => onRemoveIP(i)} style={{ margin: 0 }}>{ip}</Tag>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Geo Blocking */}
      <div style={sectionBox}>
        <SectionTitle icon={<WafIcons.Globe size={18} color={p.accent} />} title="Geo Blocking" />
        <Form form={form} layout="vertical">
          <Form.Item name="geo_blocking_enabled" label="Enable Geo Blocking" valuePropName="checked">
            <Switch checked={settings?.geo_blocking_enabled} onChange={v => handleSave({ ...settings, geo_blocking_enabled: v })} />
          </Form.Item>
          {settings?.geo_blocking_enabled && (
            <div>
              <div style={{ fontSize: 12, color: p.textMuted, marginBottom: 8 }}>Blocked Countries</div>
              <Select mode="multiple" placeholder="Select countries to block" style={{ width: '100%' }}
                options={countryOptions}
                value={settings.geo_blocked_countries}
                onChange={v => handleSave({ ...settings, geo_blocked_countries: v })} />
            </div>
          )}
        </Form>
      </div>

      <Modal title={`Add IP to ${ipType === 'whitelist' ? 'Whitelist' : 'Blacklist'}`}
        open={ipModalOpen} onCancel={() => setIPModalOpen(false)} onOk={handleAddIP}
        okText="Add" confirmLoading={ipAdding}>
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: p.textMuted, marginBottom: 4 }}>IP Address or CIDR</div>
            <Input value={newIP} onChange={e => setNewIP(e.target.value)} placeholder="e.g. 192.168.1.0/24 or 10.0.0.1" />
          </div>
          <div>
            <div style={{ fontSize: 12, color: p.textMuted, marginBottom: 4 }}>Description (optional)</div>
            <Input value={ipDesc} onChange={e => setIPDesc(e.target.value)} placeholder="e.g. Office IP range" />
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main WAF Page
// ---------------------------------------------------------------------------

type WAFTab = 'overview' | 'sites' | 'rules' | 'logs' | 'settings';

export default function WAF() {
  const { t } = useTranslation();
  const { p, isDark } = usePalette();
  const isMobile = useIsMobile();

  // Status & Stats
  const [status, setStatus] = useState<WAFStatus | null>(null);
  const [stats, setStats] = useState<WAFStats | null>(null);
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
    try {
      const { data } = await api.get<ApiResponse<WAFStatus>>('/waf/status');
      setStatus(data.data);
    } catch {
      setStatus({ installed: false, running: false } as WAFStatus);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  // Fetch Stats
  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get<ApiResponse<WAFStats>>('/waf/logs/stats');
      setStats(data.data);
    } catch {}
  }, []);

  // Fetch Sites
  const fetchSites = useCallback(async () => {
    setSitesLoading(true);
    try {
      const { data } = await api.get<ApiResponse<WAFSite[]>>('/waf/sites');
      setSites(data.data || []);
    } catch { message.error(t('common.error')); }
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

  // Fetch Settings
  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const { data } = await api.get<ApiResponse<WAFSettings>>('/waf/settings');
      setSettings(data.data);
    } catch { message.error(t('common.error')); }
    finally { setSettingsLoading(false); }
  }, [t]);

  // Initial load
  useEffect(() => {
    fetchStatus();
    fetchStats();
  }, [fetchStatus, fetchStats]);

  // Tab-specific loading
  useEffect(() => {
    if (activeTab === 'sites') fetchSites();
    if (activeTab === 'rules') fetchRules();
    if (activeTab === 'logs') fetchLogs();
    if (activeTab === 'settings') fetchSettings();
  }, [activeTab, fetchSites, fetchRules, fetchLogs, fetchSettings]);

  // Handlers
  const handleInstall = async () => {
    setInstalling(true);
    try {
      await api.post('/waf/install');
      message.success('WAF installed successfully');
      await fetchStatus();
      await fetchStats();
    } catch (e: any) {
      message.error(e?.response?.data?.message || 'Failed to install WAF');
    } finally {
      setInstalling(false);
    }
  };

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await api.post('/waf/restart');
      message.success('WAF restarted');
      await fetchStatus();
    } catch {
      message.error('Failed to restart WAF');
    } finally {
      setRestarting(false);
    }
  };

  const handleToggleMode = async (blocking: boolean) => {
    setToggling(true);
    try {
      await api.put('/waf/settings', { ...settings, global_mode: blocking ? 'blocking' : 'detection' });
      message.success(blocking ? 'Switched to Blocking mode' : 'Switched to Detection mode');
      await fetchStatus();
    } catch {
      message.error('Failed to update mode');
    } finally {
      setToggling(false);
    }
  };

  // Site CRUD
  const handleCreateSite = async (values: any) => {
    await api.post('/waf/sites', values);
    message.success('Site added');
    await fetchSites();
  };

  const handleUpdateSite = async (id: number, values: any) => {
    await api.put(`/waf/sites/${id}`, values);
    message.success('Site updated');
    await fetchSites();
  };

  const handleDeleteSite = async (id: number) => {
    await api.delete(`/waf/sites/${id}`);
    message.success('Site deleted');
    await fetchSites();
  };

  const handleToggleSite = async (id: number, enabled: boolean) => {
    await api.put(`/waf/sites/${id}/toggle`, { enabled });
    message.success(enabled ? 'Site enabled' : 'Site disabled');
    await fetchSites();
  };

  // Rule CRUD
  const handleCreateRule = async (values: any) => {
    await api.post('/waf/rules', values);
    message.success('Rule created');
    await fetchRules();
  };

  const handleUpdateRule = async (id: number, values: any) => {
    await api.put(`/waf/rules/${id}`, values);
    message.success('Rule updated');
    await fetchRules();
  };

  const handleDeleteRule = async (id: number) => {
    await api.delete(`/waf/rules/${id}`);
    message.success('Rule deleted');
    await fetchRules();
  };

  const handleToggleRule = async (id: number, enabled: boolean) => {
    await api.put(`/waf/rules/${id}/toggle`, { enabled });
    message.success(enabled ? 'Rule enabled' : 'Rule disabled');
    await fetchRules();
  };

  const handleToggleOWASP = async (categoryId: string, enabled: boolean) => {
    await api.put(`/waf/rules/owasp/${categoryId}`, { enabled });
    message.success(`OWASP ${categoryId} ${enabled ? 'enabled' : 'disabled'}`);
    await fetchRules();
  };

  // Settings
  const handleSaveSettings = async (values: any) => {
    try {
      await api.put('/waf/settings', values);
      message.success('Settings saved');
      await fetchSettings();
    } catch {
      message.error('Failed to save settings');
    }
  };

  const handleAddIP = async (ip: string, type: string, description?: string) => {
    try {
      await api.post('/waf/ip', { ip_address: ip, list_type: type, description });
      message.success('IP added');
      await fetchSettings();
    } catch {
      message.error('Failed to add IP');
    }
  };

  const handleRemoveIP = async (id: number) => {
    try {
      await api.delete(`/waf/ip/${id}`);
      message.success('IP removed');
      await fetchSettings();
    } catch {
      message.error('Failed to remove IP');
    }
  };

  const handleTabClick = (key: WAFTab) => {
    if (key === 'overview' || (status?.installed && status?.running)) {
      setActiveTab(key);
    } else {
      message.warning('Please install and enable WAF first to access this tab.');
    }
  };

  const tabs: { key: WAFTab; icon: React.ReactNode; label: string; requireEnabled?: boolean }[] = [
    { key: 'overview', icon: <WafIcons.Chart size={14} />, label: 'Overview' },
    { key: 'sites', icon: <WafIcons.Globe size={14} />, label: 'Sites', requireEnabled: true },
    { key: 'rules', icon: <WafIcons.Rule size={14} />, label: 'Rules', requireEnabled: true },
    { key: 'logs', icon: <WafIcons.Log size={14} />, label: 'Logs', requireEnabled: true },
    { key: 'settings', icon: <WafIcons.Gear size={14} />, label: 'Settings', requireEnabled: true },
  ];

  const wafEnabled = status?.installed && status?.running;

  return (
    <div style={{ padding: isMobile ? 12 : 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <WafIcons.Shield size={24} color={p.accent} />
          <div>
            <h2 style={{ margin: 0, fontWeight: 700, color: p.text, fontSize: 18 }}>Web Application Firewall</h2>
            <p style={{ margin: 0, fontSize: 12, color: p.textMuted }}>HAProxy + Coraza WAF · OWASP CRS v4</p>
          </div>
        </div>
      </div>

      {/* Main Card */}
      <div style={{
        background: isDark ? p.card : '#fff', borderRadius: 12,
        border: `1px solid ${p.cardBorder}`,
        boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        {/* Tab Bar */}
        <div style={{
          padding: '10px 20px',
          borderBottom: `1px solid ${p.cardBorder}`,
          background: p.headerBg,
          display: 'flex', gap: 4, flexWrap: 'wrap',
        }}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.key;
            const locked = tab.requireEnabled && !wafEnabled;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabClick(tab.key)}
                disabled={locked && !isActive}
                style={{
                  padding: '7px 18px', borderRadius: 6,
                  border: locked ? `1px dashed ${p.textMuted}40` : isActive ? `1px solid ${p.accent}40` : '1px solid transparent',
                  cursor: locked ? 'not-allowed' : 'pointer',
                  fontSize: 12, fontWeight: 600,
                  background: isActive ? `${p.accent}15` : locked ? `${p.textMuted}05` : 'transparent',
                  color: locked ? `${p.textMuted}60` : isActive ? p.accent : p.textMuted,
                  opacity: locked ? 0.6 : 1,
                  transition: 'all 0.15s',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                {tab.icon} {tab.label}
                {locked && <LockOutlined style={{ fontSize: 10 }} />}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div style={{ padding: 20 }}>
          {activeTab === 'overview' && (
            <OverviewTab
              status={status} stats={stats}
              onRefresh={() => { fetchStatus(); fetchStats(); }}
              onInstall={handleInstall}
              onRestart={handleRestart}
              onToggle={handleToggleMode}
              installing={installing}
              toggling={toggling}
            />
          )}
          {activeTab === 'sites' && (
            <SitesTab
              sites={sites} loading={sitesLoading}
              onRefresh={fetchSites}
              onCreate={handleCreateSite}
              onUpdate={handleUpdateSite}
              onDelete={handleDeleteSite}
              onToggle={handleToggleSite}
            />
          )}
          {activeTab === 'rules' && (
            <RulesTab
              rules={rules} categories={categories} loading={rulesLoading}
              onRefresh={fetchRules}
              onCreate={handleCreateRule}
              onUpdate={handleUpdateRule}
              onDelete={handleDeleteRule}
              onToggle={handleToggleRule}
              onToggleOWASP={handleToggleOWASP}
            />
          )}
          {activeTab === 'logs' && (
            <LogsTab
              logs={logs} loading={logsLoading} total={logsTotal}
              onRefresh={fetchLogs}
              page={logsPage} pageSize={logsPageSize}
              onPageChange={(p, s) => { setLogsPage(p); setLogsPageSize(s); }}
              filterAction={filterAction} onFilterAction={setFilterAction}
              filterCategory={filterCategory} onFilterCategory={setFilterCategory}
              search={logsSearch} onSearch={setLogsSearch}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsTab
              settings={settings} loading={settingsLoading}
              onSave={handleSaveSettings}
              onAddIP={handleAddIP}
              onRemoveIP={handleRemoveIP}
            />
          )}
        </div>
      </div>
    </div>
  );
}
