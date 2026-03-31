import { useState, useMemo, useCallback } from 'react';
import { Input, Tooltip, Popconfirm, message, Tag } from 'antd';
import {
  SearchOutlined,
  ThunderboltOutlined,
  CloseCircleOutlined,
  CaretUpFilled,
  CaretDownFilled,
  UserOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import api from '@/services/api';
import { useThemeStore } from '@/stores/theme';

/* ─── Types ──────────────────────────────────────────────────────────── */

interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  user: string;
  command: string;
  status: string;
  threads: number;
}

interface Props {
  processes: ProcessInfo[];
  onRefresh?: () => void;
}

/* ─── Dual palette ───────────────────────────────────────────────────── */

interface Palette {
  card: string;
  cardBorder: string;
  headerBg: string;
  colHeaderBg: string;
  rowHover: string;
  rowAlt: string;
  text: string;
  textMuted: string;
  textDim: string;
  barTrack: string;
  expandBg: string;
  codeBg: string;
  inputBg: string;
  accent: string;
  green: string;
  greenDim: string;
  amber: string;
  amberDim: string;
  red: string;
  redDim: string;
  purple: string;
  cyan: string;
}

const darkPalette: Palette = {
  card: '#111827',
  cardBorder: '#1E293B',
  headerBg: '#0F172A',
  colHeaderBg: 'rgba(15,23,42,0.3)',
  rowHover: 'rgba(56,189,248,0.04)',
  rowAlt: 'rgba(15,23,42,0.5)',
  text: '#E2E8F0',
  textMuted: '#64748B',
  textDim: '#475569',
  barTrack: 'rgba(30,41,59,0.8)',
  expandBg: 'rgba(15,23,42,0.6)',
  codeBg: 'rgba(0,0,0,0.3)',
  inputBg: 'rgba(15,23,42,0.6)',
  accent: '#38BDF8',
  green: '#34D399',
  greenDim: '#059669',
  amber: '#FBBF24',
  amberDim: '#D97706',
  red: '#F87171',
  redDim: '#DC2626',
  purple: '#A78BFA',
  cyan: '#22D3EE',
};

const lightPalette: Palette = {
  card: '#FFFFFF',
  cardBorder: '#E2E8F0',
  headerBg: '#F8FAFC',
  colHeaderBg: '#F1F5F9',
  rowHover: 'rgba(37,99,235,0.04)',
  rowAlt: '#F8FAFC',
  text: '#1E293B',
  textMuted: '#64748B',
  textDim: '#94A3B8',
  barTrack: '#E2E8F0',
  expandBg: '#F1F5F9',
  codeBg: '#F8FAFC',
  inputBg: '#F1F5F9',
  accent: '#2563EB',
  green: '#16A34A',
  greenDim: '#15803D',
  amber: '#D97706',
  amberDim: '#B45309',
  red: '#DC2626',
  redDim: '#B91C1C',
  purple: '#7C3AED',
  cyan: '#0891B2',
};

/* ─── Theme-aware helpers ────────────────────────────────────────────── */

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const darkUserColors = [
  { bg: 'rgba(56,189,248,0.12)', text: '#38BDF8', border: 'rgba(56,189,248,0.25)' },
  { bg: 'rgba(52,211,153,0.12)', text: '#34D399', border: 'rgba(52,211,153,0.25)' },
  { bg: 'rgba(167,139,250,0.12)', text: '#A78BFA', border: 'rgba(167,139,250,0.25)' },
  { bg: 'rgba(251,191,36,0.12)', text: '#FBBF24', border: 'rgba(251,191,36,0.25)' },
  { bg: 'rgba(248,113,113,0.12)', text: '#F87171', border: 'rgba(248,113,113,0.25)' },
  { bg: 'rgba(34,211,238,0.12)', text: '#22D3EE', border: 'rgba(34,211,238,0.25)' },
];

const lightUserColors = [
  { bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE' },
  { bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0' },
  { bg: '#F5F3FF', text: '#7C3AED', border: '#DDD6FE' },
  { bg: '#FFFBEB', text: '#D97706', border: '#FDE68A' },
  { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
  { bg: '#ECFEFF', text: '#0891B2', border: '#A5F3FC' },
];

function getUserColor(user: string, isDark: boolean) {
  const colors = isDark ? darkUserColors : lightUserColors;
  if (user === 'root') {
    return isDark
      ? { bg: 'rgba(248,113,113,0.15)', text: '#F87171', border: 'rgba(248,113,113,0.3)' }
      : { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' };
  }
  return colors[hashStr(user) % colors.length];
}

function cpuColor(v: number, p: Palette): string {
  if (v > 80) return p.red;
  if (v > 50) return p.amber;
  if (v > 20) return p.green;
  return p.accent;
}

function memColor(v: number, p: Palette): string {
  if (v > 80) return p.red;
  if (v > 50) return p.purple;
  if (v > 20) return p.accent;
  return p.cyan;
}

function cpuGradient(v: number, isDark: boolean): string {
  if (v > 80) return isDark ? 'linear-gradient(90deg, #DC2626, #F87171)' : 'linear-gradient(90deg, #B91C1C, #EF4444)';
  if (v > 50) return isDark ? 'linear-gradient(90deg, #D97706, #FBBF24)' : 'linear-gradient(90deg, #B45309, #F59E0B)';
  if (v > 20) return isDark ? 'linear-gradient(90deg, #059669, #34D399)' : 'linear-gradient(90deg, #15803D, #22C55E)';
  return isDark ? 'linear-gradient(90deg, #0369A1, #38BDF8)' : 'linear-gradient(90deg, #1D4ED8, #3B82F6)';
}

function memGradient(v: number, isDark: boolean): string {
  if (v > 80) return isDark ? 'linear-gradient(90deg, #DC2626, #F87171)' : 'linear-gradient(90deg, #B91C1C, #EF4444)';
  if (v > 50) return isDark ? 'linear-gradient(90deg, #7C3AED, #A78BFA)' : 'linear-gradient(90deg, #6D28D9, #8B5CF6)';
  if (v > 20) return isDark ? 'linear-gradient(90deg, #0284C7, #38BDF8)' : 'linear-gradient(90deg, #1D4ED8, #3B82F6)';
  return isDark ? 'linear-gradient(90deg, #0891B2, #22D3EE)' : 'linear-gradient(90deg, #0E7490, #06B6D4)';
}

function statusLabel(s: string, p: Palette): { label: string; color: string } {
  switch (s) {
    case 'R': case 'running': return { label: 'RUN', color: p.green };
    case 'S': case 'sleeping': case 'sleep': return { label: 'SLP', color: p.accent };
    case 'D': case 'disk-sleep': return { label: 'IO', color: p.amber };
    case 'Z': case 'zombie': return { label: 'ZMB', color: p.red };
    case 'T': case 'stopped': return { label: 'STP', color: p.amberDim };
    case 'I': case 'idle': return { label: 'IDL', color: p.textDim };
    default: return { label: s?.slice(0, 3).toUpperCase() || '?', color: p.textDim };
  }
}

type SortField = 'pid' | 'cpu' | 'memory' | 'name' | 'threads';


/* ─── Inline bar ─────────────────────────────────────────────────────── */

function ResourceBar({ value, gradient, color, trackColor }: {
  value: number; gradient: string; color: string; trackColor: string;
}) {
  const w = Math.min(100, Math.max(0, value));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: trackColor, overflow: 'hidden' }}>
        <div
          style={{
            width: `${w}%`,
            height: '100%',
            borderRadius: 3,
            background: gradient,
            transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
            boxShadow: w > 50 ? `0 0 6px ${color}40` : 'none',
          }}
        />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color, minWidth: 42, textAlign: 'right' }}>
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

/* ─── Sort header ────────────────────────────────────────────────────── */

function SortableHeader({ label, field, sortField, sortDir, onClick, p }: {
  label: string; field: SortField; sortField: SortField; sortDir: 'asc' | 'desc';
  onClick: (f: SortField) => void; p: Palette;
}) {
  const active = sortField === field;
  return (
    <button
      onClick={() => onClick(field)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 3, padding: 0,
        color: active ? p.accent : p.textMuted,
        fontWeight: active ? 700 : 600, fontSize: 10,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        transition: 'color 0.2s',
      }}
    >
      {label}
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 0, marginTop: -1 }}>
        <CaretUpFilled style={{ fontSize: 8, color: active && sortDir === 'asc' ? p.accent : p.textDim }} />
        <CaretDownFilled style={{ fontSize: 8, color: active && sortDir === 'desc' ? p.accent : p.textDim, marginTop: -2 }} />
      </span>
    </button>
  );
}

/* ─── Stat card ──────────────────────────────────────────────────────── */

function StatCard({ icon, label, value, color, p }: {
  icon: React.ReactNode; label: string; value: string; color: string; p: Palette;
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', borderRadius: 8, minWidth: 140,
        background: `${color}0A`, border: `1px solid ${color}20`,
      }}
    >
      <div
        style={{
          width: 32, height: 32, borderRadius: 8,
          background: `${color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color, fontSize: 14,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 10, color: p.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: p.text }}>
          {value}
        </div>
      </div>
    </div>
  );
}

/* ═══ MAIN COMPONENT ═════════════════════════════════════════════════ */

export default function ProcessTable({ processes, onRefresh }: Props) {
  const { mode } = useThemeStore();
  const isDark = mode === 'dark';
  const p = isDark ? darkPalette : lightPalette;

  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('cpu');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [expandedPid, setExpandedPid] = useState<number | null>(null);
  const pageSize = 25;

  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
        return field;
      }
      setSortDir('desc');
      return field;
    });
  }, []);

  const handleKill = useCallback(async (pid: number) => {
    try {
      await api.post('/monitor/processes/kill', { pid });
      message.success(`Process ${pid} terminated`);
      onRefresh?.();
    } catch {
      message.error(`Failed to terminate process ${pid}`);
    }
  }, [onRefresh]);

  /* ─── Derived data ─── */
  const filtered = useMemo(() => {
    let data = processes;
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(
        (proc) =>
          proc.name.toLowerCase().includes(q) ||
          proc.command.toLowerCase().includes(q) ||
          proc.user.toLowerCase().includes(q) ||
          String(proc.pid).includes(q),
      );
    }
    data = [...data].sort((a, b) => {
      const m = sortDir === 'desc' ? -1 : 1;
      const av = a[sortField] ?? 0;
      const bv = b[sortField] ?? 0;
      if (typeof av === 'string') return m * (av as string).localeCompare(bv as string);
      return m * ((av as number) - (bv as number));
    });
    return data;
  }, [processes, search, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageData = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  /* ─── Aggregate stats ─── */
  const totalCpu = processes.reduce((s, proc) => s + proc.cpu, 0);
  const totalMem = processes.reduce((s, proc) => s + proc.memory, 0);
  const zombieCount = processes.filter((proc) => proc.status === 'Z' || proc.status === 'zombie').length;

  const colHeaderStyle: React.CSSProperties = {
    fontSize: 10, color: p.textDim, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.08em',
  };

  return (
    <div
      style={{
        background: p.card, borderRadius: 12,
        border: `1px solid ${p.cardBorder}`,
        overflow: 'hidden', marginBottom: 16,
        boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ background: p.headerBg, borderBottom: `1px solid ${p.cardBorder}`, padding: '16px 20px' }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 8, height: 8, borderRadius: '50%',
                background: p.green,
                boxShadow: `0 0 8px ${p.green}60`,
                animation: 'ptPulse 2s ease-in-out infinite',
              }}
            />
            <span style={{ fontSize: 15, fontWeight: 700, color: p.text, letterSpacing: '-0.01em' }}>
              Processes
            </span>
            <Tag
              style={{
                background: `${p.accent}12`, border: `1px solid ${p.accent}30`,
                color: p.accent, fontSize: 11, fontWeight: 700,
                borderRadius: 6, padding: '0 8px', lineHeight: '22px',
              }}
            >
              {processes.length}
            </Tag>
            {zombieCount > 0 && (
              <Tag
                style={{
                  background: `${p.red}15`, border: `1px solid ${p.red}30`,
                  color: p.red, fontSize: 10, fontWeight: 700,
                  borderRadius: 6, padding: '0 6px', lineHeight: '20px',
                }}
              >
                {zombieCount} zombie
              </Tag>
            )}
          </div>
          <Input
            prefix={<SearchOutlined style={{ color: p.textDim }} />}
            placeholder="Filter processes..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            allowClear
            size="small"
            style={{
              width: 220, background: p.inputBg,
              borderColor: p.cardBorder, borderRadius: 8,
              color: p.text, fontSize: 12,
            }}
            styles={{ input: { background: 'transparent', color: p.text } }}
          />
        </div>

        {/* Stats ribbon */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatCard icon={<ThunderboltOutlined />} label="Total CPU" value={`${totalCpu.toFixed(1)}%`} color={p.accent} p={p} />
          <StatCard icon="▧" label="Total MEM" value={`${totalMem.toFixed(1)}%`} color={p.purple} p={p} />
          <StatCard icon={<UserOutlined />} label="Users" value={String(new Set(processes.map((proc) => proc.user)).size)} color={p.green} p={p} />
          <StatCard icon={<CodeOutlined />} label="Threads" value={String(processes.reduce((s, proc) => s + (proc.threads || 0), 0))} color={p.cyan} p={p} />
        </div>
      </div>

      {/* ── Table header ────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '60px 50px 1fr 160px 160px 90px 70px 40px',
          padding: '8px 16px',
          borderBottom: `1px solid ${p.cardBorder}`,
          background: p.colHeaderBg,
        }}
      >
        <SortableHeader label="PID" field="pid" sortField={sortField} sortDir={sortDir} onClick={handleSort} p={p} />
        <span style={colHeaderStyle}>ST</span>
        <SortableHeader label="Name" field="name" sortField={sortField} sortDir={sortDir} onClick={handleSort} p={p} />
        <SortableHeader label="CPU" field="cpu" sortField={sortField} sortDir={sortDir} onClick={handleSort} p={p} />
        <SortableHeader label="Memory" field="memory" sortField={sortField} sortDir={sortDir} onClick={handleSort} p={p} />
        <span style={colHeaderStyle}>User</span>
        <SortableHeader label="THR" field="threads" sortField={sortField} sortDir={sortDir} onClick={handleSort} p={p} />
        <span />
      </div>

      {/* ── Rows ────────────────────────────────────────────────── */}
      <div style={{ maxHeight: 520, overflowY: 'auto' }}>
        {pageData.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: p.textDim, fontSize: 13 }}>
            No processes match your filter
          </div>
        )}
        {pageData.map((proc, idx) => {
          const st = statusLabel(proc.status, p);
          const uc = getUserColor(proc.user, isDark);
          const isExpanded = expandedPid === proc.pid;
          const isOdd = idx % 2 === 1;
          const rowBg = isOdd ? p.rowAlt : 'transparent';

          return (
            <div key={proc.pid}>
              <div
                onClick={() => setExpandedPid(isExpanded ? null : proc.pid)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '60px 50px 1fr 160px 160px 90px 70px 40px',
                  padding: '7px 16px', alignItems: 'center',
                  cursor: 'pointer', background: rowBg,
                  borderBottom: `1px solid ${isDark ? 'rgba(30,41,59,0.4)' : '#F1F5F9'}`,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = p.rowHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = rowBg; }}
              >
                <span style={{ fontSize: 11, color: p.textMuted, fontWeight: 500 }}>
                  {proc.pid}
                </span>

                <span
                  style={{
                    fontSize: 9, fontWeight: 800,
                    color: st.color, background: `${st.color}15`,
                    padding: '2px 5px', borderRadius: 4,
                    border: `1px solid ${st.color}30`,
                    textAlign: 'center', width: 'fit-content',
                  }}
                >
                  {st.label}
                </span>

                <Tooltip title={proc.command || proc.name} placement="topLeft">
                  <span
                    style={{
                      fontSize: 12, fontWeight: 600, color: p.text,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', paddingRight: 8,
                    }}
                  >
                    {proc.name || '—'}
                  </span>
                </Tooltip>

                <ResourceBar
                  value={proc.cpu}
                  gradient={cpuGradient(proc.cpu, isDark)}
                  color={cpuColor(proc.cpu, p)}
                  trackColor={p.barTrack}
                />

                <ResourceBar
                  value={proc.memory}
                  gradient={memGradient(proc.memory, isDark)}
                  color={memColor(proc.memory, p)}
                  trackColor={p.barTrack}
                />

                <span
                  style={{
                    fontSize: 10, fontWeight: 600,
                    color: uc.text, background: uc.bg,
                    border: `1px solid ${uc.border}`, borderRadius: 5,
                    padding: '2px 7px', whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    maxWidth: 80, display: 'inline-block',
                  }}
                >
                  {proc.user || '—'}
                </span>

                <span style={{ fontSize: 11, color: p.textDim, textAlign: 'center' }}>
                  {proc.threads || '—'}
                </span>

                <Popconfirm
                  title={`Terminate process ${proc.pid}?`}
                  description={`${proc.name} (${proc.user})`}
                  onConfirm={(e) => { e?.stopPropagation(); handleKill(proc.pid); }}
                  onCancel={(e) => e?.stopPropagation()}
                  okText="Terminate"
                  cancelText="Cancel"
                  okButtonProps={{ danger: true, size: 'small' }}
                >
                  <button
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: p.textDim, fontSize: 14, padding: 4, borderRadius: 4,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'color 0.2s, background 0.2s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = p.red; e.currentTarget.style.background = `${p.red}15`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = p.textDim; e.currentTarget.style.background = 'none'; }}
                  >
                    <CloseCircleOutlined />
                  </button>
                </Popconfirm>
              </div>

              {isExpanded && (
                <div
                  style={{
                    padding: '8px 16px 8px 76px',
                    background: p.expandBg,
                    borderBottom: `1px solid ${p.cardBorder}`,
                  }}
                >
                  <div style={{ fontSize: 10, color: p.textDim, marginBottom: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Full Command
                  </div>
                  <code
                    style={{
                      fontSize: 11, color: p.accent,
                      wordBreak: 'break-all', lineHeight: 1.5, display: 'block',
                      background: p.codeBg, padding: '6px 10px',
                      borderRadius: 6, border: `1px solid ${p.cardBorder}`,
                    }}
                  >
                    {proc.command || proc.name}
                  </code>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Footer / pagination ─────────────────────────────────── */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderTop: `1px solid ${p.cardBorder}`,
          background: p.headerBg,
        }}
      >
        <span style={{ fontSize: 11, color: p.textDim }}>
          {filtered.length === processes.length
            ? `${processes.length} processes`
            : `${filtered.length} of ${processes.length} processes`}
        </span>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageIdx: number;
              if (totalPages <= 7) pageIdx = i;
              else if (safePage < 4) pageIdx = i;
              else if (safePage > totalPages - 5) pageIdx = totalPages - 7 + i;
              else pageIdx = safePage - 3 + i;
              return (
                <button
                  key={pageIdx}
                  onClick={() => setPage(pageIdx)}
                  style={{
                    width: 28, height: 28, borderRadius: 6,
                    border: pageIdx === safePage ? `1px solid ${p.accent}40` : '1px solid transparent',
                    background: pageIdx === safePage ? `${p.accent}15` : 'transparent',
                    color: pageIdx === safePage ? p.accent : p.textDim,
                    fontSize: 11, fontWeight: pageIdx === safePage ? 700 : 500,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {pageIdx + 1}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes ptPulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px ${p.green}60; }
          50% { opacity: 0.5; box-shadow: 0 0 4px ${p.green}30; }
        }
      `}</style>
    </div>
  );
}
