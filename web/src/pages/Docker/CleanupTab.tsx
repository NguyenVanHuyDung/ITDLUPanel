import React, { useState, useEffect, useCallback } from 'react';
import { Form, Input, InputNumber, Select, Switch, Modal, Spin, message, Checkbox } from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined,
  PlayCircleOutlined, ReloadOutlined, ClearOutlined,
  CheckCircleOutlined, CloseCircleOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  useDockerCleanupStore,
  type CleanupRule, type DryRunResult,
} from '@/stores/dockerCleanup';

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const CLEANUP_TYPE_OPTIONS = (t: (key: string) => string) => [
  { value: 'stopped_containers', label: t('docker.stopped_containers'), desc: t('docker.stopped_containers_desc') },
  { value: 'dangling_images',    label: t('docker.dangling_images'),    desc: t('docker.dangling_images_desc') },
  { value: 'unused_volumes',     label: t('docker.unused_volumes'),     desc: t('docker.unused_volumes_desc') },
  { value: 'unused_networks',    label: t('docker.unused_networks'),    desc: t('docker.unused_networks_desc') },
  { value: 'build_cache',        label: t('docker.build_cache'),        desc: t('docker.build_cache_desc') },
];

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/* ------------------------------------------------------------------ */
/*  Cron parser with range and step support                             */
/* ------------------------------------------------------------------ */

function parseField(field: string, min: number, max: number): number[] {
  const result: number[] = [];
  if (field === '*') {
    for (let i = min; i <= max; i++) result.push(i);
    return result;
  }
  const parts = field.split(',');
  for (const part of parts) {
    if (part.includes('/')) {
      const [range, stepStr] = part.split('/');
      const step = parseInt(stepStr, 10);
      let start = min, end = max;
      if (range !== '*') {
        if (range.includes('-')) {
          [start, end] = range.split('-').map(Number);
        } else {
          start = parseInt(range, 10);
        }
      }
      for (let i = start; i <= end; i += step) result.push(i);
    } else if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      for (let i = start; i <= end; i++) result.push(i);
    } else {
      result.push(parseInt(part, 10));
    }
  }
  return [...new Set(result)].sort((a, b) => a - b);
}

function cronPreview(expr: string): string {
  if (!expr) return '';
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return 'Invalid cron expression';
  const [minF, hrF, domF, monF, dowF] = parts;

  const mins = parseField(minF, 0, 59);
  const hrs = parseField(hrF, 0, 23);
  const doms = parseField(domF, 1, 31);
  const dows = parseField(dowF, 0, 6);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Simple common patterns
  if (domF === '*' && dowF === '*') {
    const h = hrs.length === 1 ? String(hrs[0]).padStart(2, '0') : `${Math.min(...hrs)}-${Math.max(...hrs)}`;
    const m = mins.length === 1 ? String(mins[0]).padStart(2, '0') : `${Math.min(...mins)}-${Math.max(...mins)}`;
    if (hrs.length === 1 && mins.length === 1) return `Every day at ${h}:${m}`;
    return `Every ${h}:${m}`;
  }
  if (domF === '*' && dowF !== '*') {
    const h = hrs.length === 1 ? String(hrs[0]).padStart(2, '0') : `${Math.min(...hrs)}-${Math.max(...hrs)}`;
    const m = mins.length === 1 ? String(mins[0]).padStart(2, '0') : `${Math.min(...mins)}`;
    const days = dows.map(d => dayNames[d]);
    if (days.length === 1) return `Every ${days[0]} at ${h}:${m}`;
    return `Every ${days.join(', ')} at ${h}:${m}`;
  }
  if (domF !== '*' && dowF === '*') {
    const h = hrs.length === 1 ? String(hrs[0]).padStart(2, '0') : `${Math.min(...hrs)}-${Math.max(...hrs)}`;
    const m = mins.length === 1 ? String(mins[0]).padStart(2, '0') : `${Math.min(...mins)}`;
    return `Day ${doms.join(',')} of month at ${h}:${m}`;
  }
  return expr;
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export default function CleanupTab() {
  const { t } = useTranslation();
  const { p, isDark } = usePalette();
  const isMobile = useIsMobile();

  const {
    rules, logs, logTotal, stats, loading,
    fetchRules, fetchLogs, fetchStats,
    createRule, updateRule, deleteRule, runCleanup, dryRun,
  } = useDockerCleanupStore();

  const [ruleModal, setRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<CleanupRule | null>(null);
  const [form] = Form.useForm();
  const [modeVal, setModeVal] = useState<'manual' | 'schedule' | 'threshold'>('manual');
  const [schedulePreview, setSchedulePreview] = useState('');
  const [running, setRunning] = useState<number | null>(null);
  const [logPage, setLogPage] = useState(1);

  // dry-run state
  const [dryRunModal, setDryRunModal] = useState(false);
  const [dryRunTypes, setDryRunTypes] = useState<string[]>([]);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);

  const reload = useCallback(async () => {
    await Promise.all([fetchRules(), fetchLogs(1), fetchStats()]);
  }, [fetchRules, fetchLogs, fetchStats]);

  useEffect(() => { reload(); }, [reload]);

  /* ---------- Styles ---------- */
  const sectionBox: React.CSSProperties = {
    borderRadius: 10, marginBottom: 16, padding: isMobile ? 16 : 24,
    background: isDark ? p.rowAlt : p.headerBg,
    border: `1px solid ${p.cardBorder}`,
  };

  const btnPrimary: React.CSSProperties = {
    padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
    background: p.accent, color: '#fff', fontSize: 12, fontWeight: 500,
    display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'opacity 0.15s',
  };

  const btnOutline: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
    background: 'transparent', color: p.text, fontSize: 12, fontWeight: 500,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
  };

  const btnDanger: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 6, border: `1px solid ${p.red}40`,
    background: 'transparent', color: p.red, fontSize: 12, fontWeight: 500,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
  };

  const sectionTitle = (icon: React.ReactNode, title: string, extra?: React.ReactNode) => (
    <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: p.accent }}>{icon}</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>{title}</span>
      </div>
      {extra}
    </div>
  );

  /* ---------- Rule modal ---------- */
  const openCreateRule = () => {
    setEditingRule(null);
    setModeVal('manual');
    setSchedulePreview('');
    form.resetFields();
    form.setFieldsValue({ mode: 'manual', enabled: true, keep_last_log: 10 });
    setRuleModal(true);
  };

  const openEditRule = (rule: CleanupRule) => {
    setEditingRule(rule);
    setModeVal(rule.mode);
    setSchedulePreview(rule.schedule ? cronPreview(rule.schedule) : '');
    form.setFieldsValue({
      name: rule.name,
      cleanup_types: rule.cleanup_types,
      mode: rule.mode,
      schedule: rule.schedule ?? '',
      threshold_pct: rule.threshold_pct ?? 80,
      enabled: rule.enabled,
      keep_last_log: rule.keep_last_log,
    });
    setRuleModal(true);
  };

  const handleSaveRule = async (values: Record<string, unknown>) => {
    try {
      const payload = {
        name: values.name as string,
        cleanup_types: values.cleanup_types as string[],
        mode: values.mode as 'manual' | 'schedule' | 'threshold',
        schedule: values.mode === 'schedule' ? (values.schedule as string) : undefined,
        threshold_pct: values.mode === 'threshold' ? (values.threshold_pct as number) : undefined,
        enabled: values.enabled as boolean,
        keep_last_log: values.keep_last_log as number,
      };
      if (editingRule) {
        await updateRule(editingRule.id, payload);
        message.success(t('common.update') + ' ' + t('docker.cleanup_rules'));
      } else {
        await createRule(payload);
        message.success(t('common.create') + ' ' + t('docker.cleanup_rules'));
      }
      setRuleModal(false);
      await fetchRules();
    } catch (e: unknown) {
      message.error((e as Error)?.message ?? t('common.error'));
    }
  };

  const handleDeleteRule = async (id: number) => {
    try {
      await deleteRule(id);
      message.success(t('common.delete') + ' ' + t('docker.delete_rule'));
      await fetchRules();
    } catch {
      message.error(t('common.error'));
    }
  };

  const handleRunCleanup = async (id: number) => {
    setRunning(id);
    try {
      const result = await runCleanup(id);
      if (result.status === 'success') {
        message.success(t('docker.cleanup_complete').replace('{{size}}', formatBytes(result.space_reclaimed)));
      } else {
        message.warning(t('docker.cleanup_warn'));
      }
      await Promise.all([fetchRules(), fetchLogs(1)]);
    } catch (e: unknown) {
      message.error((e as Error)?.message ?? t('docker.cleanup_failed'));
    } finally {
      setRunning(null);
    }
  };

  /* ---------- Dry-run modal ---------- */
  const openDryRun = (rule: CleanupRule) => {
    setDryRunTypes(rule.cleanup_types);
    setDryRunResult(null);
    setDryRunModal(true);
    runDryRun(rule.cleanup_types);
  };

  const runDryRun = async (types: string[]) => {
    setDryRunLoading(true);
    try {
      const result = await dryRun(types);
      setDryRunResult(result);
    } catch {
      message.error('Dry-run failed');
      setDryRunModal(false);
    } finally {
      setDryRunLoading(false);
    }
  };

  /* ---------- Stats Bar ---------- */
  const StatsBar = () => {
    if (!stats) return null;
    const pct = Math.round(stats.disk_percent);
    const color = pct > 90 ? p.red : pct > 75 ? p.amber : p.green;
    return (
      <div style={sectionBox}>
        {sectionTitle(<InfoCircleOutlined />, t('docker.disk_overview'))}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <StatCard label={t('docker.disk_usage') || 'Disk Usage'} value={`${pct}%`} sub={`${formatBytes(stats.disk_used)} / ${formatBytes(stats.disk_total)}`} color={color} />
          <StatCard label={t('docker.images') || 'Images'} value={`${stats.images_count}`} sub={formatBytes(stats.images_size)} color={p.accent} />
          <StatCard label={t('docker.containers') || 'Containers'} value={`${stats.containers_count}`} sub={formatBytes(stats.containers_size)} color={p.purple} />
          <StatCard label={t('docker.volumes') || 'Volumes'} value={`${stats.volumes_count}`} sub={formatBytes(stats.volumes_size)} color={p.cyan} />
          <StatCard label={t('docker.build_cache')} value={formatBytes(stats.build_cache_size)} sub="reclaimable" color={p.amber} />
        </div>
      </div>
    );
  };

  const StatCard = ({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) => (
    <div style={{
      flex: '1 1 140px', minWidth: 120, borderRadius: 8,
      background: isDark ? `${color}10` : `${color}08`,
      border: `1px solid ${color}30`, padding: '12px 16px',
    }}>
      <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: p.textMuted, marginTop: 2 }}>{sub}</div>
    </div>
  );

  /* ---------- Rule Card ---------- */
  const RuleCard = ({ rule }: { rule: CleanupRule }) => {
    const statusColor = rule.last_run_status === 'success' ? p.green
      : rule.last_run_status === 'failed' ? p.red : p.textMuted;

    const modeLabel = rule.mode === 'schedule'
      ? t('docker.schedule')
      : rule.mode === 'threshold'
        ? t('docker.threshold')
        : t('docker.manual');

    const modeIcon = rule.mode === 'schedule' ? '⏱ '
      : rule.mode === 'threshold' ? '⚡ '
        : '';

    return (
      <div style={{
        borderRadius: 8, padding: '14px 18px', marginBottom: 10,
        background: isDark ? p.card : '#fff',
        border: `1px solid ${p.cardBorder}`,
        display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
      }}>
        {/* Main info */}
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: p.text }}>{rule.name}</span>
            <span style={{
              fontSize: 10, padding: '1px 7px', borderRadius: 8, fontWeight: 500,
              background: rule.enabled ? `${p.green}15` : `${p.textMuted}15`,
              color: rule.enabled ? p.green : p.textMuted,
            }}>{rule.enabled ? t('common.enabled') : t('common.disabled')}</span>
            <span style={{
              fontSize: 10, padding: '1px 7px', borderRadius: 8, fontWeight: 500,
              background: `${p.cyan}12`, color: p.cyan,
            }}>{modeLabel}</span>
          </div>
          <div style={{ fontSize: 12, color: p.textMuted, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {rule.cleanup_types.map(tKey => (
              <span key={tKey} style={{
                padding: '1px 8px', borderRadius: 6,
                background: `${p.accent}12`, color: p.accent, fontSize: 11,
              }}>{tKey.replace(/_/g, ' ')}</span>
            ))}
          </div>
        </div>

        {/* Schedule / threshold info */}
        <div style={{ flex: '0 0 auto', fontSize: 12, color: p.textMuted }}>
          {rule.mode === 'schedule' && rule.schedule && (
            <div><span style={{ color: p.text }}>{modeIcon}</span>{cronPreview(rule.schedule)}</div>
          )}
          {rule.mode === 'threshold' && rule.threshold_pct != null && (
            <div><span style={{ color: p.text }}>{modeIcon}</span>{t('docker.when_disk').replace('{{pct}}', String(rule.threshold_pct))}</div>
          )}
          {rule.mode === 'manual' && (
            <div style={{ color: p.textMuted }}>{t('docker.manual_only')}</div>
          )}
          {rule.last_run_at && (
            <div style={{ marginTop: 3 }}>
              {t('docker.last_run')} <span style={{ color: statusColor }}>
                {rule.last_run_status === 'success' ? '✓' : '✗'} {new Date(rule.last_run_at).toLocaleString()}
              </span>
              {rule.last_space_reclaimed != null && rule.last_space_reclaimed > 0 &&
                <span> · {formatBytes(rule.last_space_reclaimed)} freed</span>}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button style={btnOutline} title={t('docker.preview')} onClick={() => openDryRun(rule)}>
            <InfoCircleOutlined />
          </button>
          <button style={btnOutline} title={t('common.edit')} onClick={() => openEditRule(rule)}>
            <EditOutlined />
          </button>
          <button
            style={{ ...btnPrimary, opacity: running === rule.id ? 0.7 : 1 }}
            disabled={running === rule.id}
            onClick={() => handleRunCleanup(rule.id)}
          >
            {running === rule.id ? <Spin size="small" /> : <PlayCircleOutlined />}
            {t('docker.cleanup_run')}
          </button>
          <button style={btnDanger} onClick={() => {
            Modal.confirm({
              title: t('docker.delete_rule'),
              content: t('docker.delete_rule_confirm').replace('{{name}}', rule.name),
              okType: 'danger',
              onOk: () => handleDeleteRule(rule.id),
            });
          }}>
            <DeleteOutlined />
          </button>
        </div>
      </div>
    );
  };

  /* ---------- Logs table ---------- */
  const statusIcon = (s: string) =>
    s === 'success' ? <CheckCircleOutlined style={{ color: p.green }} />
    : s === 'failed' ? <CloseCircleOutlined style={{ color: p.red }} />
    : <Spin size="small" />;

  /* ---------- Render ---------- */
  return (
    <div style={{ padding: isMobile ? '12px 0' : '4px 0' }}>
      {loading && !rules.length ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
      ) : (
        <>
          {/* Stats */}
          <StatsBar />

          {/* Rules */}
          <div style={sectionBox}>
            {sectionTitle(
              <ClearOutlined />,
              t('docker.cleanup_rules'),
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnOutline} onClick={reload}><ReloadOutlined /></button>
                <button style={btnPrimary} onClick={openCreateRule}><PlusOutlined /> {t('docker.add_rule')}</button>
              </div>
            )}

            {rules.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: p.textMuted }}>
                <ClearOutlined style={{ fontSize: 36, marginBottom: 8, display: 'block' }} />
                <div style={{ fontWeight: 500, color: p.text, marginBottom: 4 }}>{t('docker.no_cleanup_rules')}</div>
                <div style={{ fontSize: 12, marginBottom: 16 }}>{t('docker.no_cleanup_rules_desc')}</div>
                <button style={btnPrimary} onClick={openCreateRule}><PlusOutlined /> {t('docker.add_rule')}</button>
              </div>
            ) : (
              rules.map(rule => <RuleCard key={rule.id} rule={rule} />)
            )}
          </div>

          {/* logs */}
          <div style={sectionBox}>
            {sectionTitle(<InfoCircleOutlined />, t('docker.cleanup_logs').replace('{{count}}', String(logTotal)))}
            {logs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: p.textMuted, fontSize: 13 }}>
                {t('docker.no_cleanup_logs')}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: isDark ? p.card : (p as any).colHeaderBg ?? p.headerBg }}>
                      {[t('docker.cleanup_rule_col'), t('docker.triggered_by'), t('docker.started'), t('docker.duration'), t('docker.space_freed'), t('common.status')].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: p.textMuted, fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log, i) => {
                      const rule = rules.find(r => r.id === log.rule_id);
                      const duration = log.finished_at
                        ? `${((new Date(log.finished_at).getTime() - new Date(log.started_at).getTime()) / 1000).toFixed(1)}s`
                        : '…';
                      return (
                        <tr key={log.id} style={{ background: i % 2 === 0 ? 'transparent' : (isDark ? p.rowAlt : p.rowAlt) }}>
                          <td style={{ padding: '8px 12px', color: p.text }}>{rule?.name ?? `Rule #${log.rule_id ?? '—'}`}</td>
                          <td style={{ padding: '8px 12px', color: p.textMuted }}>{log.triggered_by}</td>
                          <td style={{ padding: '8px 12px', color: p.textMuted, whiteSpace: 'nowrap' }}>{new Date(log.started_at).toLocaleString()}</td>
                          <td style={{ padding: '8px 12px', color: p.textMuted }}>{duration}</td>
                          <td style={{ padding: '8px 12px', color: log.space_reclaimed > 0 ? p.green : p.textMuted }}>{formatBytes(log.space_reclaimed)}</td>
                          <td style={{ padding: '8px 12px' }}>{statusIcon(log.status)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {logTotal > 50 && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
                    <button style={btnOutline} disabled={logPage === 1}
                      onClick={() => { const p2 = logPage - 1; setLogPage(p2); fetchLogs(p2); }}>
                      ← {t('common.previous')}
                    </button>
                    <span style={{ padding: '6px 12px', color: p.textMuted, fontSize: 12 }}>{t('common.page')} {logPage}</span>
                    <button style={btnOutline} disabled={logPage * 50 >= logTotal}
                      onClick={() => { const p2 = logPage + 1; setLogPage(p2); fetchLogs(p2); }}>
                      {t('common.next')} →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ---------- Create/Edit Rule Modal ---------- */}
      <Modal
        open={ruleModal}
        title={editingRule ? t('docker.edit_rule') : t('docker.create_rule')}
        onCancel={() => { setRuleModal(false); setEditingRule(null); }}
        footer={null}
        destroyOnClose
        width={520}
        styles={{ body: { background: isDark ? p.card : '#fff' } }}
      >
        <Form form={form} layout="vertical" onFinish={handleSaveRule} style={{ marginTop: 16 }}>
          <Form.Item name="name" label={t('docker.rule_name')} rules={[{ required: true, message: t('docker.rule_name_required') }]}>
            <Input placeholder="Daily Docker Cleanup" />
          </Form.Item>

          <Form.Item name="cleanup_types" label={t('docker.cleanup_types')} rules={[{ required: true, message: t('docker.cleanup_types_required') }]}>
            <Checkbox.Group>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {CLEANUP_TYPE_OPTIONS(t).map(opt => (
                  <Checkbox key={opt.value} value={opt.value}>
                    <span style={{ fontWeight: 500 }}>{opt.label}</span>
                    <span style={{ fontSize: 11, color: p.textMuted, marginLeft: 6 }}>{opt.desc}</span>
                  </Checkbox>
                ))}
              </div>
            </Checkbox.Group>
          </Form.Item>

          <Form.Item name="mode" label={t('docker.mode')} rules={[{ required: true }]}>
            <Select
              onChange={(v: 'manual' | 'schedule' | 'threshold') => setModeVal(v)}
              options={[
                { value: 'manual', label: t('docker.manual_mode_desc') },
                { value: 'schedule', label: t('docker.schedule_mode_desc') },
                { value: 'threshold', label: t('docker.threshold_mode_desc') },
              ]}
            />
          </Form.Item>

          {modeVal === 'schedule' && (
            <Form.Item name="schedule" label={t('docker.cron_expression')} rules={[{ required: true }]}
              help={schedulePreview && <span style={{ color: p.accent }}>{schedulePreview}</span>}>
              <Input
                placeholder="0 3 * * *"
                onChange={e => setSchedulePreview(cronPreview(e.target.value))}
              />
            </Form.Item>
          )}

          {modeVal === 'threshold' && (
            <Form.Item name="threshold_pct" label={t('docker.disk_threshold')} rules={[{ required: true }]}>
              <InputNumber min={1} max={99} style={{ width: '100%' }} addonAfter="%" />
            </Form.Item>
          )}

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="keep_last_log" label={t('docker.keep_last_logs')} style={{ flex: 1 }}>
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="enabled" label={t('common.status')} valuePropName="checked" style={{ flex: 1 }}>
              <Switch />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" style={btnOutline} onClick={() => { setRuleModal(false); setEditingRule(null); }}>
              {t('common.cancel')}
            </button>
            <button type="submit" style={btnPrimary}>
              {editingRule ? t('common.save') : t('common.create')}
            </button>
          </div>
        </Form>
      </Modal>

      {/* ---------- Dry-Run Modal ---------- */}
      <Modal
        open={dryRunModal}
        title={t('docker.dry_run_preview')}
        onCancel={() => setDryRunModal(false)}
        footer={<button style={btnOutline} onClick={() => setDryRunModal(false)}>{t('common.close')}</button>}
        width={560}
        styles={{ body: { background: isDark ? p.card : '#fff' } }}
      >
        {dryRunLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : dryRunResult ? (
          <div style={{ fontSize: 13 }}>
            <div style={{ marginBottom: 12, color: p.text, fontWeight: 500 }}>
              {t('docker.estimated_reclaimable')} <span style={{ color: p.green }}>{formatBytes(dryRunResult.total_reclaimable_bytes)}</span>
            </div>

            {dryRunTypes.includes('stopped_containers') && (
              <DryRunSection
                title={`${t('docker.stopped_containers')} (${dryRunResult.stopped_containers?.length ?? 0})`}
                items={dryRunResult.stopped_containers?.map(c => c.name) ?? []}
                p={p}
              />
            )}
            {dryRunTypes.includes('dangling_images') && (
              <DryRunSection
                title={`${t('docker.dangling_images')} (${dryRunResult.dangling_images?.length ?? 0})`}
                items={dryRunResult.dangling_images?.map(img => `${img.id} (${formatBytes(img.size)})`) ?? []}
                p={p}
              />
            )}
            {dryRunTypes.includes('unused_volumes') && (
              <DryRunSection
                title={`${t('docker.unused_volumes')} (${dryRunResult.unused_volumes?.length ?? 0})`}
                items={dryRunResult.unused_volumes ?? []}
                p={p}
              />
            )}
            {dryRunTypes.includes('unused_networks') && (
              <DryRunSection
                title={`${t('docker.unused_networks')} (${dryRunResult.unused_networks?.length ?? 0})`}
                items={dryRunResult.unused_networks ?? []}
                p={p}
              />
            )}
            {dryRunTypes.includes('build_cache') && dryRunResult.build_cache_size && dryRunResult.build_cache_size > 0 && (
              <DryRunSection
                title={`${t('docker.build_cache')} (${formatBytes(dryRunResult.build_cache_size)})`}
                items={[`~${formatBytes(dryRunResult.build_cache_size)} reclaimable`]}
                p={p}
              />
            )}

            {(
              !dryRunResult.stopped_containers?.length &&
              !dryRunResult.dangling_images?.length &&
              !dryRunResult.unused_volumes?.length &&
              !dryRunResult.unused_networks?.length &&
              !(dryRunResult.build_cache_size && dryRunResult.build_cache_size > 0 && dryRunTypes.includes('build_cache'))
            ) && (
              <div style={{ textAlign: 'center', padding: '24px 0', color: p.textMuted }}>
                {t('docker.nothing_to_cleanup')}
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DryRunSection sub-component                                         */
/* ------------------------------------------------------------------ */

function DryRunSection({ title, items, p }: {
  title: string;
  items: string[];
  p: import('@/hooks/usePalette').Palette;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 600, color: p.text, marginBottom: 6 }}>{title}</div>
      <div style={{
        background: (p as any).codeBg ?? p.headerBg, borderRadius: 6,
        border: `1px solid ${p.cardBorder}`, padding: 8, maxHeight: 160, overflowY: 'auto',
      }}>
        {items.map((item, i) => (
          <div key={i} style={{ fontSize: 12, color: p.textMuted, padding: '2px 0' }}>• {item}</div>
        ))}
      </div>
    </div>
  );
}
